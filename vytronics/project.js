/*
Copyright 2014 Charles Weissman

This file is part of "Vytroncs HMI, the 100% Free, Open-Source SCADA/HMI Initiative"
herein referred to as "Vytronics HMI".

Vytronics HMI is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Vytronics HMI is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with Vytronics HMI.  If not, see <http://www.gnu.org/licenses/>.
*/

/*
Project module

Loads project.json file to define the db module global vars.

*/
var fs = require('fs');
var path = require('path');
var db = require('./db');

exports.version = '0.0.0';

var tagChanged = function(id, changeData) {
		
	//Let clients know and they will each emit a tagchanged if they
	//have mathcing subscriptions.
	db.clientdb.tagChanged(id, changeData);    
};

//Load the project.json file into db vars.

db.tagdb = require('./tagdb');

db.driverdb = require('./driverdb');

db.clientdb = require('./clientdb');

db.rpcdb = require('./rpcdb');


//Load the project from json file
var load = function(projectdir) {

    db.projectdir = path.resolve(__dirname,projectdir);
    var file = path.resolve(db.projectdir, "./project.json");

	//TODO - unload any existing project?
	
	db.log.info("Loading project " + file);
	try {

		var content=fs.readFileSync(file, "utf8");
		
		var json = JSON.parse(content);
		
		//load driverdb
		db.driverdb.load(json.drivers, db.projectdir);
		
		//load tagdb and create system tags
		db.tagdb.load(json.tags);
        
        //TODO - move this to tagdb?
		db.tagdb.emitter.on('tagChanged', function(id, data) {
			tagChanged(id,data)});
        		
		//Link up drivers
		var tags = db.tagdb.getTags();
		tags.forEach( function(tid) {
			var tag = db.tagdb.getTag(tid);
            
			if(tag.driverinfo) {
				db.driverdb.subscribe(tag.id, tag.driverinfo);
			}
            
            //Otherwise this is an in memory tag
            
		});
		
		//Start drivers
		db.driverdb.emitter.on("drivervalue", function(driverid, tags, value, item) {
			//Note that item param is not really needed. Just included for debug and
            //may get rid of it all together
			tags.forEach( function(tagid) {
				var tag = db.tagdb.getTag(tagid);
				tag.setValue(value);
			});
		});
		db.driverdb.start();
		
		//Kick off any periodic calculations
		//TODO - call tagdb method?
		db.tagdb.start();        
	}
	catch(err) {
		db.log.fatal("Exception loading project. Err:" + err);
		db.log.fatal(err.stack);
        process.exit(1);
	}
};

var applicationCall = function(name, data) {
	
	//Try to find function name
	var appCalls = db.applicationCalls;
	if ( appCalls.hasOwnProperty(name)) {
		
		try {
			var result = appCalls[name](data);
			return {result:result,err:undefined};
		}
		catch(err) {
			return{result:undefined,err:"Error: Application call failed - " + err.message};
		}        
	}
	return {result:undefined, err:"Error: Application call ["+name+"] not found."};

};

var createClient = function(socket) {
	//TODO - prolly need to be able to add authentication stuff here
	db.clientdb.createClient(exports, socket);
};
	
//Export the public stuff
module.exports.load = load;
module.exports.createClient = createClient;
