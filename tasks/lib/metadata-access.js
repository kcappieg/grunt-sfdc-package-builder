/**
 *  Defines info on how to access different metadata types via
 *  manifest
 *  Default represents API Version 44.0 (most recent audit)
 */
"use strict";
const noWildcardBacking = {
  defaultVersion: [
    'ActionOverride',
    'AnalyticSnapshot',
    'BotVersion',
    'CaseSubjectParticle', //Conflicting documentation on wildcard-appropriate
    'CustomField',
    'CustomLabel',
    'Dashboard',
    'Document',
    'EmailServicesFunction',
    'EmailTemplate',
    'EmbeddedServiceBranding',
    'EmbeddedServiceConfig',
    'EmbeddedServiceLiveAgent',
    'Folder',
    'FolderShare',
    'GlobalPicklistValue',
    'Index',
    'LetterHead',
    'ListView',
    'NamedFilter',
    'Package',
    'Picklist',
    'ProfileActionOverride',
    'RecordType',
    'Report',
    'SearchLayouts',
    'SearchSettings',
    'SharingBaseRule',
    'SharingReason',
    'SharingRecalculation',
    'SocialCustomerServiceSettings',
    'StandardValueSet',
    'Territory2Settings',
    'ValidationRule',
    'WebLink'
  ],
};

module.exports = {
  noWildcardTypes: new Proxy(noWildcardBacking, {
    get: function(target, prop) {
      if (!target[prop]) return target.defaultVersion;
      return target[prop];
    }
  })
};