/*
Copyright 2014 Vytroncs.com and Charles Weissman

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


/*JSlint allowed warning suppression*/
/*global console,require*/

var http = require('http');
var path = require('path');
var fs = require('fs');
var async = require('async');
var socketio = require('socket.io');
var express = require('express');

var project = require('./vytronics/project');

var self = this;

var datadir;

//Function for getting env vars that might be indirect delimited by
//unix style ${...} notation. For example an env like:
//  I_have${some_env}/embedded/in/me
//Can have multiple embedded env that will get resolved but not recursively.
function getenv(envstr) {
    var env = process.env[envstr];
    if (typeof env != 'undefined') {
        
        var regex = /\$\{.+?\}/g;
        var regexClean = /[{,},$]/g;

        env = env.replace(regex, function(p) {
            //remove $,{,}
            p=p.replace(regexClean,'');
            console.log('found:' + p);
            return process.env[p];
            });
    }
    return env;
}


console.log("Vytronics server.js started with node versions",process.versions );
//console.log('Process environment:', process.env);

//Get project directory from env or default
var projectdir = getenv('VYTRONICS_PROJDIR');
if (!projectdir) {
    projectdir = './project';
    
    //See if project.json, otherwise run demo
	if ( ! fs.existsSync(projectdir + '/project.json') ) {
        console.log('VYTRONICS_PROJDIR env not set and no project files in default ./project.');
        console.log('    running demo project in ./project_demo');
		projectdir = './project_demo';
	}    
    
}
console.log('VYTRONICS_PROJDIR:' + projectdir);

//Get network config. Order of precedence is:
//  Vytronics environment vars
//  Cloud9 hosted env vars
//  defaults
//
var os_port = getenv('VYTRONICS_NODEJS_PORT') || process.env.PORT || 8000;
var ipaddr = getenv('VYTRONICS_NODEJS_IP') || process.env.IP || "127.0.0.1";

//Resolve the project path relative to process directory
projectdir = path.resolve(__dirname, projectdir);

//
// Creates a new instance of an http server with the following options:
//  * `port` - The HTTP port to listen on. If `process.env.PORT` is set, _it overrides this value_.
//
var router = express();
var server = http.createServer(router);

//IO between server and clients
var io = socketio.listen(server);

//To turn off debug messages
io.set('log level', 1);

//Webserver. Root of the scripts that get included in project specific HTML
router.use(express.static(path.resolve(__dirname,'client')));

//This is the actual client directory and takes 2nd precedence.
router.use(express.static(path.resolve(projectdir,'hmi')));

//Listen for client connections and create clients
io.on('connection', function (socket) {
    
    //Note that there is no real utility in logging the client IP address. There
    //Is no method to reliabily get it especially considering NAT and also that
    //any hosted node.js server will be double proxying. Putting this note here
    //so that nobody questions why it is not taken seriously, just FYI'd
    
    var addr = socket.handshake.address;
    
    console.log("Connection opened url:"+socket.handshake.url +
        " address:" + addr.address + ":" + addr.port);
    
    //Note that query params can be extracted from
    //socket.handshake.query.myParam if needed for the application

	//Create a new client
	project.createClient(socket);
});

project.load(projectdir);

server.listen(os_port, ipaddr, function(){
  var addr = server.address();
  console.log("HMI server listening at", addr.address + ":" + addr.port);
});
