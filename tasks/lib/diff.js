/**
 *  Handles diffing files and writing diffs to cache when applicable
 */

"use strict";

const md5 = require('md5');

module.exports = {
  /**
   *  @return A Map instance where the key is the filepath (relative to the
   *  passed directory) and the value is the md5 hash string
   */
  getHashes: function(grunt, util, metaClient, partnerClient, dir, options) {
    //Get metadata describe (cached or queried)
    util.withValidSession(partnerClient, metaClient,
      (innerMetaClient) => util.describeMetadata(innerMetaClient, options.apiVersion))
      //using describe, narrow down directories to process
      .then((metaDescribe) => {

      })

  },

  /**
   *  @return Set of [SOMETHING]s whose hashes do not match.
   *  (Possibly pairs: directory name to member name?)
   */
  getChangedFiles: function(literalHashMap) {

  },

  writeHashes: function(context) {

  },
}