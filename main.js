/*--------------------------------------------------------------------------------*/
/*  REQUIRED MODULES   */
var express = require('express');
var app = express();
var httpServer = require('http').createServer(app);
var path = require("path");
var io = require("socket.io")(httpServer);
var coap = require('coap');
var infoParser = require("./info-parser.js");
/*--------------------------------------------------------------------------------*/
/*  GLOBAL VARIABLES   */
var httpPort = 8000;
var coapPort = 5683;
/*--------------------------------------------------------------------------------*/
/*  SOCKET IO - INTERACTING WITH UI   */
io.on('connection', function(socket) {
  socket.emit('clientConnected', JSON.stringify(infoParser.getGraphNodes()));

  socket.on('getNodeInfo', function(data) {
    let _nodeData = infoParser.getNodeInfo(data);
    socket.emit('sendNodeInfo', JSON.stringify(_nodeData));
    coap.request({host: _nodeData['GLOBAL IP'], method: 'PUT', pathname: '/led'})
        .on('response', function(res) { 
          res.on('end', function() {
            process.exit(0)
          });
        })
        .on('error', function(err){
          console.error(err);
        }).end();
  });

  socket.on('labelNode', function(_data){ infoParser.addNodeLabel(_data); });
});

infoParser.infoEvent.on('nodeAdded', function(_node){
  io.emit('uiAddNode', JSON.stringify(_node));
});

infoParser.infoEvent.on('nodeRemoved', function(_node){
  io.emit('uiRemoveNode', _node);
});

infoParser.infoEvent.on('nodeParentChanged', function(_node){
  io.emit('uiNodeParentChanged', JSON.stringify(_node));
});

infoParser.infoEvent.on('logAdd', function(_log){
  io.emit('uiAddLog', _log);
});
/*--------------------------------------------------------------------------------*/
/*  CoAP SERVER - RECEIVING DATA FROM NODES   */
var coapServer = coap.createServer({ type: 'udp6' });
coapServer.on('request', function(req, res) {
  infoParser.parse(req.payload);
  res.end('Hello ' + req.url.split('/')[1] + '\n');
});

coapServer.listen(coapPort, null);
/*--------------------------------------------------------------------------------*/
/*  HTTP SERVER - RENDERING UI   */
app.get('/', function (req, res) {
  res.sendFile(__dirname+'/ui/index.html');
})

app.use(express.static(__dirname+'/ui/'));

httpServer.listen(httpPort);
/*--------------------------------------------------------------------------------*/