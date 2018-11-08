/*
 * grunt-sfdc-package-builder
 * https://github.com/CMF-Group-Inc/grunt-sfdc-package-builder
 *
 * Copyright (c) 2018 Kevin C. Gall
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    jshint: {
      all: [
        'Gruntfile.js',
        'tasks/*.js',
        '<%= nodeunit.tests %>'
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    // Before generating any new files, remove any previously-created files.
    clean: {
      tests: ['tmp']
    },

    // Configuration to be run (and then tested).
    sfdc_package_builder: {
      options: {
        useWildcards: true,
        login: 'creds/intsandbox.json',
      },
      all: {
        dest: 'tmp/package-all.xml',
        all: true
      },
      noManaged: {
        dest: 'tmp/package-no_managed.xml',
        all: true,
        excludeManaged: true
      },
      withChildType: {
        dest: 'tmp/package-custom_fields.xml',
        all: false,
        // included: ['ApexClass'],
        includeSpecial: ['CustomObject'],
        excludeManaged: ['CustomField'],
      },
      diffOpts: {
        all: true,
        dest: 'tmp/package-diff.xml',
        diffDirectory: './tmp/retrieve/unpackaged/',
      }
    },

    // Unit tests.
    nodeunit: {
      tests: ['test/*_test.js']
    }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['clean', 'sfdc_package_builder', 'nodeunit']);
  grunt.registerTask('dev', ['sfdc_package_builder:all', 'sfdc_package_builder:noManaged', 'sfdc_package_builder:withChildType']);
  grunt.registerTask('diff', ['sfdc_package_builder:diffOpts:diff']);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'test']);

};
