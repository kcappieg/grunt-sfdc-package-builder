/**
 *  Package Builder task function.
 *  Accepts the soap clients Promise and builds the package.json
 */

"use strict";

//Constants
const HASH_CACHE = 'hashes/';

//3rd Party
const xmlBuilder = require('xmlbuilder');
const md5 = require('md5');
const path = require('path');

//Utils
const noWildcardTypesLib = require('./metadata-access.js').noWildcardTypes;

//Class helps aggregate context variables and consolidate code common to building
//process. It's for readability
class PackageBuilder {
  constructor(context) {
    const {grunt, util, partnerClient, metaClient, options, done} = context;
    this.grunt = grunt;
    this.util = util;
    this.partnerClient = partnerClient;
    this.metaClient = metaClient;
    this.options = options;
    this.done = done;
  }

  get metadataDescribePromise() {
    return this.util.withValidSession(this.partnerClient, this.metaClient,
      (innerMetaClient) => this.util.describeMetadata(innerMetaClient, this.options.apiVersion));
  }

  buildPackage() {
    let cmpListGetter;
    if (!!this.options.srcDir) {
      cmpListGetter = this.getChangedComponents.bind(this);
    } else {
      cmpListGetter = this.getComponentsForNewPackage.bind(this);
    }

    let buildPkgPromise = this.metadataDescribePromise.then(cmpListGetter)
    //using component lists, build package.xml
    .then((cmpLists) => {
      const {wildcardTypes, itemizedTypes} = cmpLists;

      const pkg = xmlBuilder.create('Package', {encoding: 'UTF-8'})
        .att('xmlns', 'http://soap.sforce.com/2006/04/metadata');

      //Loop through itemized list items: log and add to package
      this.grunt.log.debug('Itemized Metadata:');
      for (let itemType in itemizedTypes) {
        const itemList = itemizedTypes[itemType];
        this.grunt.log.debug(`Type ${itemType}`);

        if (itemList.length === 0) continue;

        const typeElement = pkg.ele('types');
        itemList.forEach((item) => {
          this.grunt.log.debug(`  ${item.fullName}`);

          typeElement.ele('members').text(item.fullName);
        });

        typeElement.ele('name').text(itemType);
      }

      for (let wildcard of wildcardTypes) {
        pkg.ele({
          types: {
            members: '*',
            name: wildcard.xmlName
          }
        });
      }

      pkg.ele('version').text(this.options.apiVersion);

      //write package.xml
      this.grunt.file.write(this.options.dest, pkg.end({
        pretty: true,
        indent: '  ',
        newline: '\n',
      }));

      if (this.options.srcDir && this.options.deployDir) {
        this.grunt.file.copy(
          this.options.dest,
          path.resolve(this.options.deployDir, 'package.xml')
        );
      }
    });

    this.clean(buildPkgPromise);
  }

  /**
   *  @return Promise that resolves with object containing wildcardTypes
   *  and itemizedTypes properties.
   */
  getComponentsForNewPackage(metaDescribe) {
    const wildcardTypes = []; //types we will retrieve using wildcard
    const itemizedTypes = {}; //types that we will retrieve as itemized entries
    const folderNameToType = new Map();

    // identify metadata to grab based on user options
    // then send listMetadata query
    let typesToQuery = []; //types we will retrieve by itemizing members

    // Putting metadata types requested by config into 2 buckets:
    // wildcard queries and individual queries
    const noWildcardsForVersion = noWildcardTypesLib[this.options.apiVersion];
    for (let meta of metaDescribe.metadataObjects) {
      if (this.util.includeMetadataType(this.options, meta)) {
        if (this.options.useWildcards &&
            !noWildcardsForVersion.includes(meta.xmlName) &&
            (this.options.excludeManaged === true ||
              this.options.excludeManaged.includes(meta.xmlName) ||
              this.options.excludeManaged.includes(meta.directoryName))) {
          wildcardTypes.push(meta);
        } else {
          typesToQuery.push(meta);
        }
      }

      const typeIndex = this.options.includeSpecial.indexOf(meta.xmlName);
      if (typeIndex > -1) {
        //essentially expanding includeSpecial with child elements
        const children = meta.childXmlNames || [];
        this.options.includeSpecial.splice(typeIndex, children.length, ...children);
      }
    }

    this.options.includeSpecial.forEach((type) => {
      //push an object in the same shape as the describe results
      typesToQuery.push({
        inFolder: false,
        xmlName: type
      });
    });
    
    const listQuerySets = [];
    let counter = 0;
    let querySet;
    typesToQuery.forEach((meta) => {
      if (counter % 3 === 0) {
        querySet = [];
        listQuerySets.push(querySet);
      }

      let metaTypeName = meta.xmlName;
      let typeQuery = {};
      if (meta.inFolder) {
        if (meta.xmlName === 'EmailTemplate') {
          metaTypeName = 'EmailFolder';
        } else {
          metaTypeName += 'Folder';
        }

        folderNameToType.set(metaTypeName, meta.xmlName);
      }
      typeQuery.type = metaTypeName;

      querySet.push(typeQuery);
      itemizedTypes[meta.xmlName] = []; //init list
      counter++;
    });

    //send query for itemized components
    return this.util.withValidSession(this.partnerClient, this.metaClient, (innerMetaClient) => {
      const listQueryRequests = listQuerySets.map((queryList) => {
        return innerMetaClient.listMetadataAsync({
          queries: queryList,
          asOfVersion: this.options.apiVersion
        });
      });

      //first element of returned promise data array is the wildcard types
      return Promise.all(listQueryRequests);
    })
    //handle list results: We need to recurse through folder metadata types
    //to retrieve folder contents as well
    .then((listResults) => {
      let folderContentQueries = [];
      let currentQuery;
      let counter = 0;

      listResults.forEach((res) => {
        if (!res[0]) return; //if no elements for type, nothing to do here!

        res[0].result.forEach((item) => {
          if (folderNameToType.has(item.type)) {
            if (counter % 3 === 0) {
              currentQuery = [];
              folderContentQueries.push(currentQuery);
            }
            currentQuery.push(
              {type: folderNameToType.get(item.type), folder: item.fullName}
            );

            counter++;
          } else {
            if (this.util.includeMetadataItem(this.options, item)) {
              itemizedTypes[item.type].push(item);
            }
          }
        });
      });

      const contentQueryRequests = folderContentQueries.map((current) => {
        return this.metaClient.listMetadataAsync({
          queries: current,
          asOfVersion: this.options.apiVersion
        });
      });

      return Promise.all(contentQueryRequests);
    })
    //We have all our itemized data. Build the package.xml
    .then((listResults) => {
      //first grab any content items from folders
      listResults.forEach((queryResult) => {
        if (!queryResult[0]) return; //no elements for folder, nothing to do!
        queryResult[0].result.forEach((contentItem) => {
          //filter managed items if applicable
          if (this.util.includeMetadataItem(this.options, contentItem)) {
            itemizedTypes[contentItem.type].push(contentItem);            
          }
        });
      });

      return {wildcardTypes, itemizedTypes};
    });
  }

  /**
   *  @return Promise that resolves with object containing wildcardTypes
   *  and itemizedTypes properties.
   */
  getChangedComponents(metaDescribe) {
    const rootdir = this.options.srcDir;
    if (!rootdir) {
      this.grunt.warn('Cannot get changed files: no directory specified. Include the "srcDir" option');
      this.done(false);
    }

    let pairsPromise = this.getHashes(rootdir, metaDescribe)
    .then((literalHashMap) => {
      const hashdir = literalHashMap.hashdir;
      const changedPairs = [];
      const diffLog = {};

      const cmpSet = new Set();
      for (let [filePath, hash] of literalHashMap) {
        let newPair;
        try {
          const hashFilePath = hashdir + filePath;

          let oldHash = this.grunt.file.read(hashFilePath);
          if (oldHash !== hash) {
            newPair = extractPair(filePath);

            diffLog[hashFilePath] = {
              hash,
              relativePath: filePath
            };
          }
        } catch (fileErr) {
          //file not found in old hash means it's a new file and should be added
          this.util.logErr(fileErr);
          newPair = extractPair(filePath);
        }

        if (newPair) {
          //filter out duplicates - same component, different files
          let setStr = newPair.dirName + newPair.memberName;
          if (!cmpSet.has(setStr)) {
            changedPairs.push(newPair);
            cmpSet.add(setStr);
          }
        }
      }

      if (changedPairs.length === 0) {
        throw new Error('No files have changed - no manifest necessary');
      }

      //write log of diff-ed files here
      this.grunt.file.write(this.options.diffLog, JSON.stringify(diffLog));

      //if deployDir specified, write components
      if (!!this.options.deployDir) {
        for (let prop in diffLog) {
          let filePath = diffLog[prop].relativePath;
          let original = path.resolve(rootdir, filePath);
          let newFile = path.resolve(this.options.deployDir, filePath);

          this.grunt.file.copy(original, newFile);

          //check for accompanying meta file
          let originalMeta = original + '-meta.xml';
          if (this.grunt.file.exists(originalMeta)) {
            this.grunt.file.copy(originalMeta, newFile + '-meta.xml');
          }
        }
      }

      return changedPairs;
    });

    const typeByDirname = {};

    for (let meta of metaDescribe.metadataObjects) {
      typeByDirname[meta.directoryName] = meta.xmlName;
    }

    let finalPromise;

    //query all items to filter out managed
    if (this.options.excludeManaged.length >>> 0 !== 0) {
      let itemizedTypes = {};
      finalPromise = pairsPromise.then((changedPairs) => {
        //prep queries
        const querySets = [];
        let currentQueryList;
        let counter = 0;

        changedPairs.forEach((pair) => {
          let type = typeByDirname[pair.dirName];

          //adding to query list if we haven't seen the type before or it's in
          //a folder
          if (!!pair.folder || !itemizedTypes[type]) {
            if (counter % 3 === 0) {
              currentQueryList = [];
              querySets.push(currentQueryList);
            }

            currentQueryList.push({folder: pair.folder, type});
          }

          if (!itemizedTypes[type]) itemizedTypes[type] = [];
        });

        return Promise.all(querySets.map((queryList) => {
          return this.metaClient.listMetadataAsync({
            queries: queryList,
            asOfVersion: this.options.apiVersion
          });
        }));
      })
      .then((resultsLists) => {
        resultsLists.forEach((queryResult) => {
          if (!queryResult[0]) return; //no elements for folder, nothing to do!
          queryResult[0].result.forEach((contentItem) => {
            //filter managed items if applicable
            if (this.util.includeMetadataItem(this.options, contentItem)) {
              itemizedTypes[contentItem.type].push(contentItem);            
            }
          });
        });

        return {wildcardTypes: [], itemizedTypes};
      });

    //simply aggregate items into lists by type
    } else {
      finalPromise = pairsPromise.then((changedPairs) => {
        let itemizedTypes = {};

        changedPairs.forEach((pair) => {
          let type = typeByDirname[pair.dirName];
          if (!itemizedTypes[type]) itemizedTypes[type] = [];

          itemizedTypes[type].push({fullName:pair.memberName, type});
        });

        return {wildcardTypes: [], itemizedTypes};
      });
    }

    return finalPromise;
  }

  /**
   *  This function hashes all files within a given directory and leaves it
   *  to other parts of the task to filter out managed components.
   *  @return Promise whose data is a Map instance where the key is the filePath
   *  (relative to the passed directory) and the value is the md5 hash string.
   *  The map also includes a private reference to the root directory of the
   *  hashes
   */
  getHashes(rootdir, metaDescribe) {
    const dir = rootdir.charAt(rootdir.length - 1) === '/' ? rootdir : rootdir + '/';

    let innerMetaDescribePromise;

    if (!!metaDescribe) {
      innerMetaDescribePromise = new Promise((resolve) => resolve(metaDescribe));
    } else {
      innerMetaDescribePromise = this.metadataDescribePromise;
    }

    //Get metadata describe (cached or queried)
    return innerMetaDescribePromise
    //using describe, narrow down directories to process
    .then((metaDescribe) => {
      const directories = [];

      metaDescribe.metadataObjects.forEach((meta) => {
        if (this.util.includeMetadataType(this.options, meta)) {
          directories.push(meta.directoryName);
        }
      });

      if (directories.length === 0) {
        throw new Error('No directories specified: cannot hash files');
      }

      return directories;
    })
    //process directory list by hashing all files
    .then((directories) => {
      const hashMap = new Map();

      //hash the absolute path of the dir we received. This is so that the
      //user can specify alternate Path strings to the same directory, but
      //we will store our cache in the same location
      const dirHash = md5(path.resolve(dir));

      hashMap.hashdir = this.util.TASK_DIR + HASH_CACHE + dirHash + '/';

      directories.forEach((metadir) => {
        let metaPath = dir + metadir;
        if (this.grunt.file.exists(metaPath)) {
          this.grunt.file.recurse(dir + metadir, (abspath, rootdir, subdir, filename) => {
            let filePath = metadir + '/';
            if (subdir) filePath += subdir + '/';
            filePath += filename;

            hashMap.set(filePath, md5(this.grunt.file.read(abspath)));
          });
        }
      });

      return hashMap;
    });
  }

  writeHashes() {
    const rootdir = this.options.srcDir;
    if (!rootdir) {
      this.grunt.warn('Cannot get changed files: no directory specified. Include the "srcDir" option');
      this.done(false);
    }


    //get hashes, then write to cache
    let writePromise = this.getHashes(rootdir)
    .then((literalHashMap) => {
      const hashdir = literalHashMap.hashdir;

      //clear all previous
      if (this.grunt.file.exists(hashdir)) {
        this.grunt.file.delete(hashdir);
      }

      for (let [filePath, hash] of literalHashMap) {
        this.grunt.file.write(hashdir + filePath, hash);
      }
    });

    this.clean(writePromise);
  }

  commitDiffs() {
    let diffLog
    try {
      diffLog = this.grunt.file.readJSON(this.options.diffLog);
    } catch (err) {
      this.done(this.grunt.util.error(`Problem reading diff log ${this.options.diffLog}`, err));
      return;
    }

    for (let prop in diffLog) {
      this.grunt.file.write(prop, diffLog[prop].hash);
    }

    this.grunt.file.delete(this.options.diffLog);

    this.done();
  }

  clean(prom) {
    let doneErr;

    //Catch errors and clean up
    prom.catch((err) => {
      this.util.logErr(err);

      doneErr = err;
    })
    .finally(() => {
      if (this.options.clearCache) {
        this.grunt.file.delete(this.util.CACHE_DIR);
      }

      this.done(doneErr);
    });
  }
}

function extractPair(filePath) {
  const pathArray = path.normalize(filePath).split(path.sep);
  const dirName = pathArray[0];

  let memberName;
  let folder = '';

  if (dirName === 'aura') {
    memberName = pathArray[1]; //the directory containing the files for an aura component

  //a folder-based type. Member name is concat of path
  } else if (['documents', 'email', 'reports', 'dashboards'].includes(dirName)) {
    if (pathArray.length === 2) {
      memberName = stripMeta(pathArray[1]);
    } else {
      memberName = stripMeta(pathArray.slice(1).join('/'));
      folder = memberName.substring(0, memberName.lastIndexOf('/'));
    }

  } else {
    //as simple as grabbing everything before the first period
    memberName = pathArray[pathArray.length - 1].split('.')[0];
  }

  return {dirName, memberName, folder};
}

function stripMeta(filename) {
  if (filename.endsWith('-meta.xml')) {
    return filename.substring(0, filename.lastIndexOf('-meta.xml'));
  }

  return filename;
}

module.exports = PackageBuilder;