/*
 * grunt-sfdc-package-builder
 * https://github.com/CMF-Group-Inc/grunt-sfdc-package-builder
 *
 * Copyright (c) 2018 Kevin C. Gall, CM&F Group Inc.
 * Licensed under the MIT license.
 */

'use strict';

//Utils
const PackageBuilder = require('./lib/build-package.js');

module.exports = function(grunt) {
  const util = require('./lib/utils')(grunt);

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

  grunt.registerMultiTask('sfdc_package_builder', 'Package.xml builder for SFDC platform as grunt task', function(action='build') {
    const done = this.async();

    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      all: false,
      useWildcards: false,
      metaWsdlLoc: `${__dirname}/../data/metadata-wsdl.xml`,
      partnerWsdlLoc: `${__dirname}/../data/partner-wsdl.xml`,
      excludeManaged: false,
      clearCache: false,
      dest: 'package.xml',
      apiVersion: '44.0',
      srcDir: '',
      diffLog: './diff.log'
    });

    Object.assign(options, this.data);

    if (options.excludeManaged === false) options.excludeManaged = [];

    if (!Array.isArray(options.includeSpecial)) { options.includeSpecial = []; }

    if (!options.login) {
      grunt.warn('Login credentials missing');
      return;
    }

    let creds;
    try {
      if (typeof options.login === 'string') {
        creds = grunt.file.readJSON(options.login);
      } else {
        creds = options.login;
      }
    } catch (err) {
      grunt.warn('Unable to read login');
      return;
    }

    //check that there's something for us to build
    const nothingIncluded =
      !options.all && !(options.included && options.included.length > 0);
    const nothingSpecial =
      !(options.includeSpecial && options.includeSpecial.length > 0);
    const isDiff = !!options.diffDirectory;
    if (nothingIncluded && (isDiff || nothingSpecial)) {
      grunt.warn(
`No metadata requested - specify either "all" or specific metadata in "included"
If not diff-ing, alternatively specify "includeSpecial"`
      );
      return;
    }

    const partnerSoapOptions = {};
    if (!!creds.url) {
      partnerSoapOptions.endpoint = creds.url + '/services/Soap/u/' + options.apiVersion;
    }

    //get session data and metadata soap client
    let clientsPromise = Promise.all([
      util.getPartnerClient(creds, options.partnerWsdlLoc, partnerSoapOptions),
      util.getMetaClient(options.metaWsdlLoc)
    ])
    .then((data) => {
      const context = {
        that: this,
        util,
        grunt,
        partnerClient: data[0],
        metaClient: data[1],
        options,
        done,
      };

      const builder = new PackageBuilder(context);

      if (action === 'build') {
        builder.buildPackage();
      } else if (action === 'diff') {
        builder.writeHashes();
      } else if (action === 'commit') {
        builder.commitDiffs();
      } else {
        grunt.warn(`Action ${action} not supported`);
        return;
      }
    });
  });
};