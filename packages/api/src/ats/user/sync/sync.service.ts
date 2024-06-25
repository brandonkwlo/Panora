import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '@@core/logger/logger.service';
import { PrismaService } from '@@core/prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { FieldMappingService } from '@@core/field-mapping/field-mapping.service';
import { ServiceRegistry } from '../services/registry.service';
import { WebhookService } from '@@core/webhook/webhook.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { CoreUnification } from '@@core/utils/services/core.service';
import { ApiResponse } from '@@core/utils/types';
import { IUserService } from '../types';
import { OriginalUserOutput } from '@@core/utils/types/original/original.ats';
import { UnifiedUserOutput } from '../types/model.unified';
import { ats_users as AtsUser } from '@prisma/client';
import { ATS_PROVIDERS } from '@panora/shared';
import { AtsObject } from '@ats/@lib/@types';

@Injectable()
export class SyncService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
    private webhook: WebhookService,
    private fieldMappingService: FieldMappingService,
    private serviceRegistry: ServiceRegistry,
    private coreUnification: CoreUnification,
    @InjectQueue('syncTasks') private syncQueue: Queue,
  ) {
    this.logger.setContext(SyncService.name);
  }

  async onModuleInit() {
    try {
      await this.scheduleSyncJob();
    } catch (error) {
      throw error;
    }
  }

  private async scheduleSyncJob() {
    const jobName = 'ats-sync-users';

    // Remove existing jobs to avoid duplicates in case of application restart
    const jobs = await this.syncQueue.getRepeatableJobs();
    for (const job of jobs) {
      if (job.name === jobName) {
        await this.syncQueue.removeRepeatableByKey(job.key);
      }
    }
    // Add new job to the queue with a CRON expression
    await this.syncQueue.add(
      jobName,
      {},
      {
        repeat: { cron: '0 0 * * *' }, // Runs once a day at midnight
      },
    );
  }

  @Cron('0 */8 * * *') // every 8 hours
  async syncUsers(user_id?: string) {
    try {
      this.logger.log('Syncing users...');
      const users = user_id
        ? [
            await this.prisma.users.findUnique({
              where: {
                id_user: user_id,
              },
            }),
          ]
        : await this.prisma.users.findMany();
      if (users && users.length > 0) {
        for (const user of users) {
          const projects = await this.prisma.projects.findMany({
            where: {
              id_user: user.id_user,
            },
          });
          for (const project of projects) {
            const id_project = project.id_project;
            const linkedUsers = await this.prisma.linked_users.findMany({
              where: {
                id_project: id_project,
              },
            });
            linkedUsers.map(async (linkedUser) => {
              try {
                const providers = ATS_PROVIDERS;
                for (const provider of providers) {
                  try {
                    await this.syncUsersForLinkedUser(
                      provider,
                      linkedUser.id_linked_user,
                      id_project,
                    );
                  } catch (error) {
                    throw error;
                  }
                }
              } catch (error) {
                throw error;
              }
            });
          }
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async syncUsersForLinkedUser(
    integrationId: string,
    linkedUserId: string,
    id_project: string,
  ) {
    try {
      this.logger.log(
        `Syncing ${integrationId} users for linkedUser ${linkedUserId}`,
      );
      // check if linkedUser has a connection if not just stop sync
      const connection = await this.prisma.connections.findFirst({
        where: {
          id_linked_user: linkedUserId,
          provider_slug: integrationId,
          vertical: 'ats',
        },
      });
      if (!connection) {
        this.logger.warn(
          `Skipping users syncing... No ${integrationId} connection was found for linked user ${linkedUserId} `,
        );
        return;
      }
      // get potential fieldMappings and extract the original properties name
      const customFieldMappings =
        await this.fieldMappingService.getCustomFieldMappings(
          integrationId,
          linkedUserId,
          'ats.user',
        );
      const remoteProperties: string[] = customFieldMappings.map(
        (mapping) => mapping.remote_id,
      );

      const service: IUserService =
        this.serviceRegistry.getService(integrationId);
      const resp: ApiResponse<OriginalUserOutput[]> = await service.syncUsers(
        linkedUserId,
        remoteProperties,
      );

      const sourceObject: OriginalUserOutput[] = resp.data;

      // unify the data according to the target obj wanted
      const unifiedObject = (await this.coreUnification.unify<
        OriginalUserOutput[]
      >({
        sourceObject,
        targetType: AtsObject.user,
        providerName: integrationId,
        vertical: 'ats',
        customFieldMappings,
      })) as UnifiedUserOutput[];

      // insert the data in the DB with the fieldMappings (value table)
      const users_data = await this.saveUsersInDb(
        linkedUserId,
        unifiedObject,
        integrationId,
        sourceObject,
      );
      const event = await this.prisma.events.create({
        data: {
          id_event: uuidv4(),
          status: 'success',
          type: 'ats.user.synced',
          method: 'SYNC',
          url: '/sync',
          provider: integrationId,
          direction: '0',
          timestamp: new Date(),
          id_linked_user: linkedUserId,
        },
      });
      await this.webhook.handleWebhook(
        users_data,
        'ats.user.pulled',
        id_project,
        event.id_event,
      );
    } catch (error) {
      throw error;
    }
  }

  async saveUsersInDb(
    linkedUserId: string,
    users: UnifiedUserOutput[],
    originSource: string,
    remote_data: Record<string, any>[],
  ): Promise<AtsUser[]> {
    try {
      let users_results: AtsUser[] = [];
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const originId = user.remote_id;

        if (!originId || originId === '') {
          throw new ReferenceError(`Origin id not there, found ${originId}`);
        }

        const existingUser = await this.prisma.ats_users.findFirst({
          where: {
            remote_id: originId,
            id_connection: connection_id,
          },
        });

        let unique_ats_user_id: string;

        if (existingUser) {
          // Update the existing user
          let data: any = {
            modified_at: new Date(),
          };
          if (user.first_name) {
            data = { ...data, first_name: user.first_name };
          }
          if (user.last_name) {
            data = { ...data, last_name: user.last_name };
          }
          if (user.email) {
            data = { ...data, email: user.email };
          }
          if (user.disabled !== undefined) {
            data = { ...data, disabled: user.disabled };
          }
          if (user.access_role) {
            data = { ...data, access_role: user.access_role };
          }
          if (user.remote_created_at) {
            data = { ...data, remote_created_at: user.remote_created_at };
          }
          if (user.remote_modified_at) {
            data = { ...data, remote_modified_at: user.remote_modified_at };
          }
          const res = await this.prisma.ats_users.update({
            where: {
              id_ats_user: existingUser.id_ats_user,
            },
            data: data,
          });
          unique_ats_user_id = res.id_ats_user;
          users_results = [...users_results, res];
        } else {
          // Create a new user
          this.logger.log('User does not exist, creating a new one');
          const uuid = uuidv4();
          let data: any = {
            id_ats_user: uuid,
            created_at: new Date(),
            modified_at: new Date(),
            remote_id: originId,
            id_connection: connection_id,
          };

          if (user.first_name) {
            data = { ...data, first_name: user.first_name };
          }
          if (user.last_name) {
            data = { ...data, last_name: user.last_name };
          }
          if (user.email) {
            data = { ...data, email: user.email };
          }
          if (user.disabled !== undefined) {
            data = { ...data, disabled: user.disabled };
          }
          if (user.access_role) {
            data = { ...data, access_role: user.access_role };
          }
          if (user.remote_created_at) {
            data = { ...data, remote_created_at: user.remote_created_at };
          }
          if (user.remote_modified_at) {
            data = { ...data, remote_modified_at: user.remote_modified_at };
          }

          const newUser = await this.prisma.ats_users.create({
            data: data,
          });

          unique_ats_user_id = newUser.id_ats_user;
          users_results = [...users_results, newUser];
        }

        // check duplicate or existing values
        if (user.field_mappings && user.field_mappings.length > 0) {
          const entity = await this.prisma.entity.create({
            data: {
              id_entity: uuidv4(),
              ressource_owner_id: unique_ats_user_id,
            },
          });

          for (const [slug, value] of Object.entries(user.field_mappings)) {
            const attribute = await this.prisma.attribute.findFirst({
              where: {
                slug: slug,
                source: originSource,
                id_consumer: linkedUserId,
              },
            });

            if (attribute) {
              await this.prisma.value.create({
                data: {
                  id_value: uuidv4(),
                  data: value || 'null',
                  attribute: {
                    connect: {
                      id_attribute: attribute.id_attribute,
                    },
                  },
                  entity: {
                    connect: {
                      id_entity: entity.id_entity,
                    },
                  },
                },
              });
            }
          }
        }

        // insert remote_data in db
        await this.prisma.remote_data.upsert({
          where: {
            ressource_owner_id: unique_ats_user_id,
          },
          create: {
            id_remote_data: uuidv4(),
            ressource_owner_id: unique_ats_user_id,
            format: 'json',
            data: JSON.stringify(remote_data[i]),
            created_at: new Date(),
          },
          update: {
            data: JSON.stringify(remote_data[i]),
            created_at: new Date(),
          },
        });
      }
      return users_results;
    } catch (error) {
      throw error;
    }
  }
}
