import { CrmObject } from 'src/crm/@types';
import { CrmObjectInput, Unified, UnifySourceType } from '../../../types';
import { mapToHubspotContact, mapToUnifiedContact } from './mappers/contact';

export async function desunifyHubspot<T extends Unified>({
  sourceObject,
  targetType_,
}: {
  sourceObject: T;
  targetType_: CrmObject;
}): Promise<CrmObjectInput> {
  switch (targetType_) {
    case CrmObject.contact:
      return mapToHubspotContact(sourceObject);
    case CrmObject.deal:
    //return mapToHubspotDeal(sourceObject);
    case CrmObject.company:
    //return mapToHubspotCompany(sourceObject);
    // Add other cases for different CrmObject types
    default:
      throw new Error(`Unsupported target type for Hubspot: ${targetType_}`);
  }
}
export async function unifyHubspot<
  T extends UnifySourceType | UnifySourceType[],
>({ sourceObject, targetType_ }: { sourceObject: T; targetType_: CrmObject }) {
  switch (targetType_) {
    case CrmObject.contact:
      return mapToUnifiedContact(sourceObject);
    case CrmObject.deal:
    //return mapToHubspotDeal(sourceObject);
    case CrmObject.company:
    //return mapToHubspotCompany(sourceObject);
    // Add other cases for different CrmObject types
    default:
      throw new Error(`Unsupported target type for Hubspot: ${targetType_}`);
  }
}