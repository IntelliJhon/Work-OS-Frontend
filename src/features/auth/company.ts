/**
 * The company's own workspace (LeadsNDeals). Clients and Complaints are internal tools of this
 * workspace only; the API enforces the same check. Matched on the workspace id alone, because
 * names and slugs are chosen at signup.
 */
export const LEADSNDEALS_TENANT_ID = 'aee1faf8-27d5-4f5d-9b14-9246abbd0eec';

export const isLeadsndealsTenant = (tenantId: string | undefined | null) => tenantId === LEADSNDEALS_TENANT_ID;
