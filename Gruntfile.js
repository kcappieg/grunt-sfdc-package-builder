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
        'tasks/**/*.js',
        '<%= jasmine.sfdc_package_builder.options.specs %>'
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
        useWildcards: false,
        all: true,
        dump: 'tmp/debug.log'
      },
      noManaged: {
        dest: 'tmp/package-no_managed.xml',
        all: true,
        useWildcards: false,
        excludeManaged: true,
        includeSpecial: ['CustomObject'],
        dump: 'tmp/dump.txt'
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
        srcDir: './tmp/retrieve/unpackaged/',
        diffLog: './d.log',
        deployDir: './tmp/deploy'
      },
      test: {
        dest: 'tmp/test.xml',
        useWildcards: false,
        all: true,
        // included: ['CustomTab'],
        excludeManaged: true,
        dump: 'tmp/dump.txt'
      }
    },

    // Unit tests.
    jasmine: {
      sfdc_package_builder: {
        options: {
          specs: 'test/specs/*Spec.js',
          summary: true
        }
      }
      
    }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-jasmine');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  const buildTasks = [
    'sfdc_package_builder:all',
    'sfdc_package_builder:noManaged',
    'sfdc_package_builder:withChildType',
    'sfdc_package_builder:diffOpts'
  ];

  const diffTasks = ['sfdc_package_builder:diffOpts:diff'];

  //for now, unit test task is a stub - mocking responses sucks!
  grunt.registerTask('test', ['jasmine']);
  grunt.registerTask('dev', buildTasks);
  grunt.registerTask('diff', diffTasks);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'test']);

};
