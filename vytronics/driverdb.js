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

var util = require("util");
var path = require("path");
var fs = require("fs");
var events = require("events");
var db = require("./db");

exports.version = '0.0.0';

//List of loaded drivers
var drivers = {};

//Emits drivervalue events
var emitter = new events.EventEmitter();
	
//Load drivers from json file
var load = function (json) {
    
    var builtin = [ {id:'sim', info:{uri:'simdriver'}} ];

    //Instantiate built in drivers
    builtin.forEach( function(drv) {        
        drivers[drv.id] = new Driver(drv.id, drv.info);
    });

    
    if ( undefined === json ) {
        return;
    }
    console.log("Loadings drivers.");
    
 	for( var drvid in json ) {
		if( json.hasOwnProperty(drvid ) ) {
            
            //Do not let someone assign builtin driver id's or uris
            var reserved = false;
            builtin.forEach( function(drv) {
                if ( drv.info.uri === json[drvid].uri ) {
                    console.log("driverdb.load error:" + drv.info.uri + " is loaded by default. Not loading driver:" + drvid, json[drvid]);
                    reserved=true;
                }              
                if ( drv.id === drvid ) {
                    console.log("driverdb.load error:" + drvid + " is a reserved driver id. Not loading driver:" + drvid,json[drvid]);
                    reserved=true;
                }
            });
            
            if (reserved) continue;
            
			drivers[drvid] = new Driver(drvid,json[drvid]);
		}
	}    
}

//Link a driver item to a tag
var subscribe = function(tagid, driverInfo) {

	if ( !driverInfo.id) {
		console.log("driverdb driver missing id property:", driverInfo);
		return;
	}
	
	var driverid = driverInfo.id;

	if( ! drivers.hasOwnProperty(driverid) ) {
		console.log("DriverDB no such driver ID:" + driverid);
		return;
	}
	
	var driver = drivers[driverid];
	
	//Link to driver data (i.e., register the item). The item string is driver specific.
	//The DriverDB does not really care what is inside. The driver will emit data each
	//time value associated with the item changes.
	var item=driverInfo.item;
	driver.driverObj.register(item);
	
	//Remember the linkage
	var itemsubs = driver.items[item];
	if(!itemsubs) driver.items[item]=[];
	
	driver.items[item].push(tagid);
	
}

//Start each driver.
var start = function() {
	getDrivers().forEach( function(id) {
		console.log("Starting driver:" + id);
		drivers[id].driverObj.start();
	});	
}

//Get list of loaded drivers as an array of driver id's.
var getDrivers = function() {
	var ids = [];
	for( var id in drivers ) {
		if ( drivers.hasOwnProperty(id) ) {
			ids.push(id);
		}
	}
	return ids;
};

exports.emitter = emitter; //driverdb event emitter. TODO - why does exports.on = emitter.on not work?
exports.load = load;
exports.subscribe = subscribe;
exports.start = start;
exports.getDrivers = getDrivers;


exports.write_item = function(driverinfo, value) {

    var driver = drivers[driverinfo.id];
    
    return driver.driverObj.write_item(driverinfo.item, value);    
}

//Create a driver from config info in json file
function Driver(id,info) {
console.log('Creating driver id:'+id + ' info:',info);
    //To capture this var in closures
	var self = this;
		
	this.id = id;
	
	//Items and the tags that have subscribed to them for this driver. Each member is
	//an object with the name of an item and a list of tags that have subscribed to it.
    //This allows the driverdb to attach a list of tags to an emitted "drivervalue" message.
    //That is, if an "itemvalue" is received from a driver, a corresponding "drivervalue" message
    //will be emitted  with the list of tags linked to the item.
	this.items = {};
	//Example:
	//items = {
	//	"item.1": [tag1, tag2...],
	//	"item.another": [tagA],
	//	...
	//}
		
	//uri is required.
	var uri = info.uri;
	if ( undefined === uri ) {
		throw new Error("Driver missing 'uri' property.");
	}
	
    //Driver module loading.
    //TODO - What kind of sanitizing is needed? Maybe none since even when hosted
    //a project will execute in its own virtual machine. Shame on the designer
    //for loading an inappropriate module.
	//
    //Search priority is built in drivers, then drivers in datadir
	//
	//Look for built in driver then for driver included in the project.
	var driverpath = path.resolve("./vytronics",uri + ".js");
    console.log('looking for built-in driver:'+driverpath);
	if ( ! fs.existsSync(driverpath) ) {
		driverpath = path.resolve(db.projectdir,uri);
	}

    //A driver module must supply a create method that returns a driver object
    //with the following properties and methods
    //TODO - document the required interface here
    //  
    //
	this.driverObj = require(driverpath).create(info.config);

    //Driver objects will emit "itemvalue" messages
	this.driverObj.emitter.on("itemvalue", function(item, value) {
		//console.log("driver id:" + id + " item:" + item + " value:" + value);
		self.procItemValues(item,value);
	});
}

//Callback function for "itemvalue" messages emitted by a driver object.
//Send drivervalue event for the tag or tags that link to this driver item
Driver.prototype.procItemValues = function(item,value) {
	var tags = this.items[item];
	if(!tags) {
		console.log("Driver error. Received item change for invalid item:" + item);
		return;
	}
	
	//Tell project that a list of tags have a new value. In most cases there is just one tag
	//but could be more if there are multiple tags that subscribe to the same driver and item (rare)
	emitter.emit("drivervalue", this.id, item, tags, value);
}




