# grunt-sfdc-package-builder [![npm version](https://badge.fury.io/js/grunt-sfdc-package-builder.svg)](https://badge.fury.io/js/grunt-sfdc-package-builder)

> Package.xml builder for SFDC platform as grunt task

## Getting Started
This plugin requires Grunt `~1.0.0`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-sfdc-package-builder --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-sfdc-package-builder');
```

The task takes an argument for the action that is being performed. In most cases, the task will simply build a package.xml file. However, the task has the ability to build only a package manifest for files that have changed since the last time files have been diff-ed. In order to use this diff-ing functionality, you must run the task with the `diff` action:

```shell
grunt sfdc_package_builder:my_config:diff
```

Then, to build a package.xml from only the files changed since running the diff action

```shell
grunt sfdc_package_builder:my_config
```

To reset the mechanism that discovers changed files, you need to "commit" changes using the `commit` action:

```shell
grunt sfdc_package_builder:my_config:commit
```

## The "sfdc_package_builder" task

### Overview

**Disclaimer** This package released as "beta" because it is being actively developed at this time in ways that may cause breaking changes and because there are no unit tests. If you, like me, went looking for a bridge between SFDX and old-style metadata pulls but came up short (besides the now dead MavensMate) and now want to use this package, reach out!

This task automates the building of the `package.xml` file required for many SFDC development tasks. Existing tools like https://github.com/benedwards44/packagebuilder do a good job of building package manifests, but packagebuilder specifically requires the user to either hook into the existing Heroku-hosted app or to spin up a local server, and additionally does not allow granular package building.

This task runs locally (besides the callouts to the Salesforce Metadata Api) and allows fine-grained control over the resulting manifest that can be used in a variety of situations including full metadata pulls and deploy manifests.

This task also offers functionality to build manifests for only changed files via hash diff detection. Additional "actions" are available to support tasks that wish to use this functionality to automatically deploy only changed components.

Lastly, an experimental feature being developed is the ability to build a full metadata component directory with manifest from a given source directory for use in a metadata deploy. It is unlikely to be fully featured for all situations and component types as there are other tools to accomplish this, but the primary goal is to allow quick and easy deploys of source code like Apex and Aura that would be developed locally and pushed to Salesforce. The author recommends that a prospective user looks into using standard SFDX techniques to accomplish this, however if you, like me, are in the midst of transitioning and need a stop-gap, this feature may work for you. (The components this feature has been tested with are code components including ApexClass, ApexTrigger, and AuraDefinitionBundle)

### Usage

In your project's Gruntfile, add a section named `sfdc_package_builder` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  sfdc_package_builder: {
    options: {
      login: 'credentials/sandbox.json'
    },
    default: {
      all: true,
      dest: './package.xml'
    },
    diff_example: {
      dest: './diff/package.xml'
      included: ['ApexClass', 'ApexTrigger'],
      excludeManaged: true,
      diffDirectory: './src',
      diffLog: './diff.log'
    }
  },
});
```

The exposed task accepts an "action" argument to support the diff-ing capabilities of the task.

#### `build`

This is the default action if none is specified. This builds a package.xml document.

```shell
grunt sfdc_package_builder:default
```

#### `diff`

This action prepares for a "diff" build by hashing all files in the `srcDir` and storing them on disk for reference. Any diff build will rehash selected files and only include them in the result `package.xml` if the hash value is different.

```shell
grunt sfdc_package_builder:diff_example:diff
```

Then, after you make changes to your code files:

```shell
grunt sfdc_package_builder:diff_example
```

Notice that you can (and should) use the same configuration when running the `diff` action and the `build` action.

A `build` that uses diff-ing will write changed file paths and their hash values to a log as specified by the `diffLog` option. This log is used by the `commit` action to update saved hash values in the cache which indicates that the new hashes represent the saved state on the Salesforce servers.

#### `commit`

This action "commits" a diff build which previously logged to the file indicated by the `diffLog` option. Running this action allows the task to save the changed file hashes after processing has been completed, for instance after a successful deploy to the Salesforce org.

### Options

Many of the below options accept a "Metadata Description List" as described below:

#### MetaList
Type: `Array<String>`

Array where each element is the value of the `<name>` Node corresponding to the metadata type **or** the directory name that will be delivered in the .zip file

#### options.all
Type: `boolean`
Default value: `false`

A flag that indicates that all metadata types should be included

#### options.useWildcards
Type: `boolean`
Default value: `false`

A flag that indicates whether or not the wildcard character `*` should be used where available.

Note that metadata retrieved with wildcards will exclude Managed Package components.

#### options.metaWsdlLoc
Type: `String`

A relative filepath for the location of the SFDC Metadata API WSDL. This option is a failsafe, as the package is distributed with the current SFDC metadata WSDL

#### options.partnerWsdlLoc
Type: `String`

A relative filepath for the location of the SFDC Partner API WSDL. This option is a failsafe, as the package is distributed with the current SFDC partner WSDL

#### options.excluded
Type: `MetaList`

If `options.all === false`, this option will be ignored

#### options.included
Type: `MetaList`

If `options.all === true`, this option will be ignored

#### options.includeSpecial
Type: `Array<String>`

This list is for metadata types that are not typically included without a parent metadata type. For instance, `CustomField` is a child of `CustomObject`, but can be queried separately. A common use case would be to retrieve all Custom Fields added to a Managed Object without necessarily querying the Managed Object.

The entries in the list are the values of the `<name>` XML elements, but not a folder name.

Alternatively, entries in the list can be the XML name of a parent metadata type for which you want to query all children. (i.e. `CustomObject`)

#### options.excludeManaged
Type: `boolean | MetaList`
Default: `false`

If `true`, managed package data will be excluded for all chosen metadata types. If a `MetaList`, each list entry will be excluded, but all others will include managed package metadata. Entries that are not "included" via the `all` or `included` options are ignored.

#### options.includeManaged

Type: `MetaList`

If specified and `options.excludeManaged` is `true`, this list can specify metadata types for which managed package components *should* be included

*Note: The excludeManaged and includeManaged options are a little inconsistent because certain functionality was added later for convenience. A later release will likely alter the structure of these options*

#### options.clearCache
Type: `boolean`
Default: `false`

If `true`, clears the cache of metadata info after performing all operations. Cached items include session and metadata describe information but *not* the results of queries since this is volatile information.

**Note** You can manually clear the metadata cache before executing this task by deleting the file located at `%PROJECT_ROOT%/.grunt/sfdc-package-builder/metadata-describe.cache`

#### options.dest
Type: `String`
Default: `"./package.xml"`

The destination for the package.xml file

#### options.apiVersion
Type: `String`
Default: `46.0`

The Metadata API version to use. Defaults to latest as of package release

#### options.login
Type: `Object | String`

If object, has these properties:
 - username
 - password
 - url - Only the host, not the path (i.e. `"https://test.salesforce.com"`)
 - token - The security token for the user

If string, this is the relative filepath for a json file of the above described schema

#### options.srcDir
Type: `String`

If specified, the directory indicated by this option is used to build a package.xml based on files that have changed since the last time the `diff` action was passed to the task. Note that if all metadata types are included, this task may take awhile as it hashes **all files included** and compares agains the previous hash. Recommended use is to limit the diff-ing to only the metadata types you expect to update regularly.

If a file has not been hashed by this task or if the task's cache is cleared, all files will be marked as changed and added to the `package.xml`

This directory is also used as the source for the deploy directory, if specified. All files marked as changed in the diff will be added to the deploy directory

When this option is specified, the `includeSpecial` option is ignored

#### options.diffLog
Type: `String`
Default: `./diff.log`

When building a package using a diff, a log file of all diffs detected is written to the file specified by this option. When the `commit` action is used, the diffs in this file are written to the diff cache for use in later diff comparisons, and this file is deleted.

The diff log is a JSON formatted file where each key corresponds to the location of a file's current hash value, and each value is an object with the following properties:
- `hash` - Hash string
- `relativePath` - The path of the file relative to the root directory of the org source

#### options.deployDir
Type: `String`

If specified, this directory is the location of the metadata deploy source that will be built from files that have changed since the last time the `diff` action was run. The directory will include all source files included in the manifest as well as a copy of the package.xml manifest generated. This directory is usable with the `sfdx force:mdapi:deploy` command

This option is ignored if `options.srcDir` is not specified.

### Usage Examples

#### Examples
##### Basic
In this example, the task-global option is to use wildcards where applicable, and the specific task `basic` will create a package.xml file that includes all possible metadata units and put it at `%PROJECT_ROOT$/basic_package.xml`, excluding any managed metadata

```js
grunt.initConfig({
  sfdc_package_builder: {
    options: {
      useWildcards: true,
      login: 'credentials/my-sandbox-credentials.json'
    },
    basic: {
      all: true,
      dest: './basic_package.xml',
      excludeManaged: true
    }
  },
});
```

##### Full org with Managed
This example will build a package to query the full org with managed metadata, so basically a full org dump.

```js
grunt.initConfig({
  sfdc_package_builder: {
    full_org: {
      all: true,
      useWildcards: false,
      dest: './full_org_package.xml',
      excludeManaged: false
    }
  },
});
```

##### All unmanaged components
This example will build a package to query all unmanaged metadata including customizations to managed Custom Objects

```js
grunt.initConfig({
  sfdc_package_builder: {
    unmanaged: {
      all: true,
      useWildcards: true,
      dest: './unmanaged_package.xml',
      excludeManaged: true,
      includeSpecial: ['CustomObject']
    }
  },
});
```

##### Just Apex and Objects
This example will build a package to query all Apex and Custom Objects, but exclude managed Apex

```js
grunt.initConfig({
  sfdc_package_builder: {
    apex_objects: {
      useWildcards: false,
      dest: './apex_objects_package.xml',
      included: ['ApexClass', 'ApexTrigger', 'CustomObject'],
      excludeManaged: ['ApexClass','ApexTrigger']
    }
  },
});
```

##### A Diff config
This example configuration can be used for both the diff action and building the diff-ed package. It will create hashes of all Apex and Aura files when run with the `diff` action. Then, when run with as a build, it will hash the current state of the files and only include items whose hashes do not match in the package.xml generated

```js
grunt.initConfig({
  sfdc_package_builder: {
    diffOpts: {
      useWildcards: false,
      dest: './diff_package.xml',
      included: ['ApexClass', 'ApexTrigger', 'AuraDefinitionBundle'],
      excludeManaged: true,
      diffDirectory: './codebase/src'
    }
  },
});
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History
11/8/2018 - 0.0.1-beta.1