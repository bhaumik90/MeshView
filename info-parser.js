var moment = require('moment');
var log = require("./logging.js");
const infoEventEmitter = require('events');
class InfoEmitter extends infoEventEmitter {}
const infoEmitter = new InfoEmitter();

// Type of network
var networkType = { 1: "RPL" };
Object.freeze(networkType);

// Node Information Type
var infoType = {
  0: "NODE TYPE",
  1: "PREFIX",
  2: "ID",
  3: "PARENT ID",
  4: "RANK",
  5: "DODAG ID",
  6: "DAG VERSION",
  7: "CHANNEL",
  8: "PAN ID",
  9: "TX POWER",
  10: "FIRMWARE VERSION"
};
Object.freeze(infoType);

var nodeType = {
  0: "ROOT",
  1: "ROUTER",
  2: "END NODE"
};
Object.freeze(nodeType);

var network_info = [];
var LINK_LOCAL_PREFIX = "fe80";
var orphan_nodes = [];
var NETWORK_TICK_INTERVAL = 1000; // 1 second
var NODE_TIMEOUT = 15 * 60; // 15 Minutes
var nodeLabels = {};
/*---------------------------------------------------------------------------*/
function macToIpv6Addr(prefix, mac)
{
  return ([prefix,'',mac.slice(0, 4),mac.slice(4, 8),mac.slice(8, 12),mac.slice(12, 16)].join(':'));
}

function isOrphan(parentId)
{
  for(let i in network_info)
  {
    if(network_info[i]['ID']===parentId)
      return false;
  }
  return true;
}
/*---------------------------------------------------------------------------*/
function addNodeInfo(data)
{
  let _entryExists = false;

  for(let i=0; i<network_info.length; i++)
  {
    // Node exists
    if(data.ID===network_info[i].ID)
    {
      if(data['NODE TYPE']!=='ROOT')
      {
        // Now checking for any data changes
        if(network_info[i]["RANK"] !== data["RANK"])
        {
          log.info("Node "+((nodeLabels[data.ID]!==undefined)?nodeLabels[data.ID]:data.ID)+" rank changed from "+network_info[i]["RANK"]+" to "+data["RANK"]);
          sendLogToUi("["+getLogTime()+"]: Node "+((nodeLabels[data.ID]!==undefined)?nodeLabels[data.ID]:data.ID)+" rank changed from "+network_info[i]["RANK"]+" to "+data["RANK"]);
        }
        if(network_info[i]['PARENT ID']!==data['PARENT ID'])
        {
          // Sending changed information to UI
          infoEmitter.emit('nodeParentChanged', {"id": network_info[i]['ID'], "pId": data['PARENT ID']});
          log.info("Node "+((nodeLabels[data.ID]!==undefined)?nodeLabels[data.ID]:data.ID)+" parent changed from "+network_info[i]["PARENT ID"]+" to "+data["PARENT ID"]);
          sendLogToUi("["+getLogTime()+"]: Node "+((nodeLabels[data.ID]!==undefined)?nodeLabels[data.ID]:data.ID)+" parent changed from "+network_info[i]["PARENT ID"]+" to "+data["PARENT ID"]);
        }
      }
      network_info[i] = data;
      network_info[i]['LAST HEARD'] = 0; return;
    }
  }

  // Entry doesn't exists, adding for the first time
  log.info("Node "+((nodeLabels[data.ID]!==undefined)?nodeLabels[data.ID]:data.ID)+" added.");
  sendLogToUi("["+getLogTime()+"]: Node "+((nodeLabels[data.ID]!==undefined)?nodeLabels[data.ID]:data.ID)+" added.");
  network_info.push(data);

  // Check if the parent of this node is available in the network_info
  if(('PARENT ID' in data) && (isOrphan(data["PARENT ID"])))
    orphan_nodes.push({'id':data.ID, 'pId':data['PARENT ID']});

  // Sending new node to UI
  infoEmitter.emit('nodeAdded', {
    "nodes": [{"id":data['ID'],"group":data['NODE TYPE'],"label":nodeLabels[data['ID']]}],
    "links": (('PARENT ID' in data) && (!isOrphan(data["PARENT ID"]))) ? [{"source":data['ID'],"target":data['PARENT ID']}] : []
  });
}
/*---------------------------------------------------------------------------*/
module.exports = {
  "parse": function(data) {
    let _nodeInfo = {};
    let prefix;

    // Check for the type of network
    if((_nodeInfo.NETWORK = networkType[data[0]])==undefined)
    {
      log.error("Not an RPL Network Node"); return;
    }

    // Parse the information TLVs
    for(let i=1; i<data.length-1;)
    {
      let type = data[i]; i++;
      let len = data[i]; i++;
      let val = Buffer.allocUnsafe(len);
      data.copy(val, 0, i, i+len);

      switch(infoType[type])
      {
        case "NODE TYPE":
          _nodeInfo[infoType[type]] = nodeType[val[0]];
        break;

        case 'PREFIX':
          prefix = val.toString('hex');
        break;

        case "ID":
          _nodeInfo[infoType[type]] = val.toString('hex');
          val[0] ^= 2;
          _nodeInfo["LINK-LOCAL IP"] = macToIpv6Addr(LINK_LOCAL_PREFIX, val.toString('hex'));
          _nodeInfo["GLOBAL IP"] = macToIpv6Addr(prefix, val.toString('hex'));
        break;

        case "PARENT ID":
          _nodeInfo[infoType[type]] = val.toString('hex');
          val[0] ^= 2;
          _nodeInfo["PARENT LINK-LOCAL IP"] = macToIpv6Addr(LINK_LOCAL_PREFIX, val.toString('hex'));
          _nodeInfo["PARENT GLOBAL IP"] = macToIpv6Addr(prefix, val.toString('hex'));
        break;

        case 'RANK':
          _nodeInfo[infoType[type]] = parseInt(val.toString('hex'), 16).toString();
        break;

        case "DODAG ID":
          val[0] ^= 2;
          _nodeInfo[infoType[type]] = macToIpv6Addr(prefix, val.toString('hex'));
        break;

        case "DAG VERSION":
          _nodeInfo[infoType[type]] = parseInt(val.toString('hex'), 16).toString();
        break;

        case "CHANNEL":
          _nodeInfo[infoType[type]] = parseInt(val.toString('hex'), 16).toString();
        break;

        case "PAN ID":
          _nodeInfo[infoType[type]] = "0x"+val.toString('hex');
        break;

        case "TX POWER":
          _nodeInfo[infoType[type]] = val.readInt8(0).toString()+" dBm";
        break;

        case "FIRMWARE VERSION":
          _nodeInfo[infoType[type]] = val.readInt8(0).toString()+"."+val.readInt8(1).toString();
        break;

        case undefined:
        break;

        default:
          _nodeInfo[infoType[type]] = val.toString('hex');
        break;
      }
      i+=len;
    }
    _nodeInfo["LAST HEARD"] = 0;
    addNodeInfo(_nodeInfo);
  },
  "getGraphNodes": function()
  {
    let _graphInfo = {"nodes":[], "links": []};
    for(let i in network_info)
    {
      _graphInfo.nodes.push({"id":network_info[i]['ID'],"group":network_info[i]['NODE TYPE'],"label":nodeLabels[network_info[i]['ID']]});
      if(('PARENT ID' in network_info[i]) && (!isOrphan(network_info[i]["PARENT ID"])))
        _graphInfo.links.push({"source":network_info[i]['ID'],"target":network_info[i]['PARENT ID']});
    }
    return _graphInfo;
  },
  "getNodeInfo": function(_nodeId)
  {
    for(let i=0; i<network_info.length; i++)
    {
      if(network_info[i].ID===_nodeId)
      {
        return(network_info[i]);
      }
    }
  },
  "infoEvent": infoEmitter,
  addNodeLabel: function(data) { nodeLabels[data.id] = data.label; }
}
/*---------------------------------------------------------------------------*/
setInterval(function(){
  if(network_info.length===0) return;

  let _isTableChanged = false;

  // Check for node timeouts
  for(let i in network_info)
  {
    network_info[i]['LAST HEARD'] += 1;
    if(network_info[i]['LAST HEARD']>=NODE_TIMEOUT)
    {
      infoEmitter.emit('nodeRemoved', network_info[i]['ID']);
      log.info("Node "+((nodeLabels[network_info[i]['ID']]!==undefined)?nodeLabels[network_info[i]['ID']]:network_info[i]['ID'])+" timed out.");
      sendLogToUi("["+getLogTime()+"]: Node "+((nodeLabels[network_info[i]['ID']]!==undefined)?nodeLabels[network_info[i]['ID']]:network_info[i]['ID'])+" timed out.");
      network_info.splice(i, 1);
      _isTableChanged = true;
    }
  }

  // Check if any orphan nodes got parents
  if(orphan_nodes.length>0)
  {
    for(let j in orphan_nodes)
    {
      if(!isOrphan(orphan_nodes[j].pId))
      {
        infoEmitter.emit('nodeAdded', {
          "nodes": [],
          "links": [{"source":orphan_nodes[j].id,"target":orphan_nodes[j].pId}]
        });
        orphan_nodes.splice(j,1);
      }
    }
  }

}, NETWORK_TICK_INTERVAL);
/*---------------------------------------------------------------------------*/
function sendLogToUi(_log) {
  infoEmitter.emit('logAdd', _log);
}

function getLogTime()
{
  return moment().format('YYYY-MM-DD HH:mm:ss');
}
/*---------------------------------------------------------------------------*/