/**
 *  Defines info on how to access different metadata types via
 *  manifest
 *  Default represents API Version 44.0 (current latest as of release)
 */
"use strict";
const noWildcardBacking = {
  defaultVersion: [
    'AnalyticSnapshot',
    'BotVersion',
    'CaseSubjectParticle', //Conflicting documentation on wildcard-appropriate
    'Dashboard',
    'Document',
    'EmailServicesFunction',
    'EmailTemplate',
    'EmbeddedServiceBranding',
    'EmbeddedServiceConfig',
    'EmbeddedServiceLiveAgent',
    'LetterHead',
    'Report',
    'StandardValueSet'
  ],
  '44.0': this.defaultVersion
};

module.exports = {
  noWildcardTypes: new Proxy(noWildcardBacking, {
    get: function(target, prop) {
      if (!target[prop]) return target.defaultVersion;
      return target[prop];
    }
  })
};