import {
  Controller,
  Post,
  Body,
  Query,
  Get,
  Param,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { LoggerService } from '@@core/logger/logger.service';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiCustomResponse } from '@@core/utils/types';
import { SharedLinkService } from './services/sharedlink.service';
import {
  UnifiedSharedLinkInput,
  UnifiedSharedLinkOutput,
} from './types/model.unified';
import { ConnectionUtils } from '@@core/connections/@utils';
import { ApiKeyAuthGuard } from '@@core/auth/guards/api-key.guard';
import { FetchObjectsQueryDto } from '@@core/utils/dtos/fetch-objects-query.dto';

@ApiTags('filestorage/sharedlink')
@Controller('filestorage/sharedlink')
export class SharedlinkController {
  constructor(
    private readonly sharedlinkService: SharedLinkService,
    private logger: LoggerService,
    private connectionUtils: ConnectionUtils,
  ) {
    this.logger.setContext(SharedlinkController.name);
  }

  @ApiOperation({
    operationId: 'list',
    summary: 'List a batch of Sharedlinks',
  })
  @ApiHeader({
    name: 'x-connection-token',
    required: true,
    description: 'The connection token',
    example: 'b008e199-eda9-4629-bd41-a01b6195864a',
  })
  @ApiCustomResponse(UnifiedSharedLinkOutput)
  @UseGuards(ApiKeyAuthGuard)
  @Get()
  async list(
    @Headers('x-connection-token') connection_token: string,
    @Query() query: FetchObjectsQueryDto,
  ) {
    try {
      const { linkedUserId, remoteSource, connectionId } =
        await this.connectionUtils.getConnectionMetadataFromConnectionToken(
          connection_token,
        );
      const { remote_data, limit, cursor } = query;
      return this.sharedlinkService.getSharedlinks(
        connectionId,
        remoteSource,
        linkedUserId,
        limit,
        remote_data,
        cursor,
      );
    } catch (error) {
      throw new Error(error);
    }
  }

  @ApiOperation({
    operationId: 'retrieve',
    summary: 'Retrieve a Sharedlink',
    description:
      'Retrieve a sharedlink from any connected Filestorage software',
  })
  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    description: 'id of the sharedlink you want to retrieve.',
  })
  @ApiQuery({
    name: 'remote_data',
    required: false,
    type: Boolean,
    description:
      'Set to true to include data from the original File Storage software.',
  })
  @ApiHeader({
    name: 'x-connection-token',
    required: true,
    description: 'The connection token',
    example: 'b008e199-eda9-4629-bd41-a01b6195864a',
  })
  @ApiCustomResponse(UnifiedSharedLinkOutput)
  @UseGuards(ApiKeyAuthGuard)
  @Get(':id')
  async retrieve(
    @Headers('x-connection-token') connection_token: string,
    @Param('id') id: string,
    @Query('remote_data') remote_data?: boolean,
  ) {
    const { linkedUserId, remoteSource } =
      await this.connectionUtils.getConnectionMetadataFromConnectionToken(
        connection_token,
      );
    return this.sharedlinkService.getSharedlink(
      id,
      linkedUserId,
      remoteSource,
      remote_data,
    );
  }

  @ApiOperation({
    operationId: 'create',
    summary: 'Create a Sharedlink',
    description: 'Create a sharedlink in any supported Filestorage software',
  })
  @ApiHeader({
    name: 'x-connection-token',
    required: true,
    description: 'The connection token',
    example: 'b008e199-eda9-4629-bd41-a01b6195864a',
  })
  @ApiBody({ type: UnifiedSharedLinkInput })
  @ApiCustomResponse(UnifiedSharedLinkOutput)
  @UseGuards(ApiKeyAuthGuard)
  @Post()
  async create(
    @Body() unifiedSharedlinkData: UnifiedSharedLinkInput,
    @Headers('x-connection-token') connection_token: string,
    @Query('remote_data') remote_data?: boolean,
  ) {
    try {
      const { linkedUserId, remoteSource, connectionId } =
        await this.connectionUtils.getConnectionMetadataFromConnectionToken(
          connection_token,
        );
      return this.sharedlinkService.addSharedlink(
        unifiedSharedlinkData,
        connectionId,
        remoteSource,
        linkedUserId,
        remote_data,
      );
    } catch (error) {
      throw new Error(error);
    }
  }
}
