var socket = io.connect();
var dataSet = {"nodes":[], "links":[]};
var isNodeClicked = false;
var selectedNode = null;
var eventLogs = [];
var rootLinkDist;
var COLLIDE_RADIUS = 20;
var clickTimeOut;
var isDoubleClick = false;
var fileData = null;
var fotaNodes = [];

var color = {
  'ROOT': "#ECB840",
  'ROUTER': "#68BACF",
  'END NODE': '#d5f4e6'
}

var svg = d3.select("svg");
var width = svg.node().getBoundingClientRect().width;
var height = svg.node().getBoundingClientRect().height;
var arc = d3.arc().innerRadius(5).outerRadius(7).startAngle(0);

svg.style("height", height).on("click", handleSvgClick);


var linkGroup = svg.append("g").attr("class", "link");
var nodeGroup = svg.append("g").attr("class", "node");
var nodeLabelGroup = svg.append('g').attr("class", "label");
var fotaProgressGroup = svg.append('g').attr("class", "fota");
var link, node, nodeLabel, fotaProgress;

var simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(function(d) { return d.id; }).distance(function(link){
      return Math.max((countSubLinks(link.source))?getRootLinkDist()*2:getRootLinkDist(),COLLIDE_RADIUS*3);
    }).strength(1))
    .force("collision", d3.forceCollide().radius(COLLIDE_RADIUS))
    .force("center", d3.forceCenter(width / 2, height / 2));
/*--------------------------------------------------------------------------------*/
/*  GRAPH CREATOR   */
function createGraph() {

  link = linkGroup.selectAll("line").data(dataSet.links, function(l) { return l.target.id + l.source.id  });
  link.exit().remove();
  link = link.enter().append("line").merge(link);

  node = nodeGroup.selectAll("circle").data(dataSet.nodes, function(d) { return d.id + d.group + d.label });
  node.exit().remove();
  node = node.enter().append("circle")
      .attr("r", 7)
      .attr("fill", function(d) { return color[d.group] })
      .merge(node)
      .on("mouseover", handleMouseOver)
      .on("mouseout", handleMouseOut)
      .on("click", handleNodeClick)
      .on("dblclick",handleNodeDblClick)
      .call(d3.drag()
        .on("start", handleDragStarted)
        .on("drag", handleDragged)
        .on("end", handleDragEnded));

  nodeLabel = nodeLabelGroup.selectAll("text").data(dataSet.nodes, function(d) { return d.id + d.group + d.label });
  nodeLabel.exit().remove();
  nodeLabel = nodeLabel.enter().append("text")
              .attr('id',function(d) { return 'l'+d.id})
              .text(function(d) {
                return ('label' in d) ? d.label : d.id.slice(-2);
              }).merge(nodeLabel)

  fotaProgress = fotaProgressGroup.selectAll("path").data(fotaNodes);
  fotaProgress.exit().remove();
  fotaProgress = fotaProgress.enter().append("path")
                  .attr("fill", "#4C4E5F")
                  .attr("id",function(d) { return 'f'+d.id})
                  .attr("d", arc).merge(fotaProgress);

  simulation.nodes(dataSet.nodes).on("tick", ticked);
  simulation.force("link").links(dataSet.links);
  simulation.alpha(0.2).restart();
}
/*--------------------------------------------------------------------------------*/
/*  GRAPH EVENT HANDLERS   */
function ticked() {
  link
  .attr("x1", function(d) { return d.source.x; })
  .attr("y1", function(d) { return d.source.y; })
  .attr("x2", function(d) { return d.target.x; })
  .attr("y2", function(d) { return d.target.y; });

  node
  .attr("cx", function(d) { return d.x; })
  .attr("cy", function(d) { return d.y; });

  nodeLabel
  .attr("x", function(d) { return d.x+7; })
  .attr("y", function(d) { return d.y+7/2; });

  fotaProgress
  .attr('transform', function(d){ return 'translate('+getNode(d.id).x+','+getNode(d.id).y+')'});
}

function handleDragStarted(d) {
  if (!d3.event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function handleDragged(d) {
  d.fx = d3.event.x;
  d.fy = d3.event.y;
}

function handleDragEnded(d) {
  if (!d3.event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

function handleMouseOver(d, i) {
  d3.select(this).append("title").text(function(d) { return d.id; });
}

function handleMouseOut(d, i) {
  d3.select(this).select("title").remove();
}

function handleNodeClick(d, i) {
  isNodeClicked = true;
  clickTimeOut = setTimeout(function(){
    if(!isDoubleClick)
    {
      if((selectedNode!==null) && (selectedNode.id===d.id))
      {
        selectedNode = null; showPopup(false); return;
      }
      selectedNode = d;
      socket.emit('getNodeInfo', dataSet.nodes[i].id);
    }
    isDoubleClick = false;
  }, 150);
}

function handleNodeDblClick(d, i)
{
  isDoubleClick = true;
  isNodeClicked = true;
  clearTimeout(clickTimeOut);
  selectedNode = d;
  showPopup(false);
  document.getElementById("mvInputNodeLabel").value = d3.select("#l"+d.id).text();
  $('#mvNodeConfigModal').modal('show');
  document.getElementById('mvOtaImageLabel').innerHTML = "Select OTA image";  
  d3.select('#mvNodeConfigModalTitle').text("Node Configuration: "+d.id);
}

function handleSvgClick() {

  if(!isNodeClicked)
  {
    selectedNode = null;
    showPopup(false);
  }
  isNodeClicked = false;
}

function showPopup(condition)
{
  d3.select("#node-info").classed("show", condition);
}

function readFile(file) 
{
  var reader = new FileReader();
  reader.onload = readSuccess;
  function readSuccess(evt) {
    document.getElementById('mvOtaImageLabel').innerHTML = file.name+'\t'+parseFloat(file.size/1024).toFixed(2)+' KB';
    if(evt.target.readyState==2) fileData = evt.target.result;
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('mvOtaImage').onchange = function(e) {
  readFile(e.srcElement.files[0]);
};

function nodeConfigSubmit()
{
  event.preventDefault();
  d3.select("#l"+selectedNode.id).text(function(){
    return document.getElementById("mvInputNodeLabel").value;
  })
  getNode(selectedNode.id).label = document.getElementById("mvInputNodeLabel").value;
  socket.emit('labelNode', {id:selectedNode.id,label:document.getElementById("mvInputNodeLabel").value});
  $('#mvNodeConfigModal').modal('hide');

  if(fileData!==null) socket.emit('otaUpload', {nodeId: selectedNode.id, image: fileData});

  selectedNode = null;
}

function nodeConfigCancel()
{
  event.preventDefault();
  $('#nvNodeConfigModal').modal('hide');
  selectedNode = null;
  fileData = null;
}
/*--------------------------------------------------------------------------------*/
/*  SOCKET IO LISTENERS   */
socket.on('clientConnected', function(_data){
  
  dataSet = JSON.parse(_data);
  createGraph();
  updateNodeNumbers();
});

socket.on('uiAddNode', function(_data) {
  let _entry = JSON.parse(_data);
  for(let i in _entry.nodes)
  {
    if(getNode(_entry.nodes[i].id)===null)
      dataSet.nodes.push(_entry.nodes[i]);
  }
  for(let i in _entry.links)
  {
    if(getLink(_entry.links[i].source, _entry.links[i].target)===null)
      dataSet.links.push(_entry.links[i]);
  }
  console.log("uiAddNode dataSet: ",dataSet);
  createGraph();
  updateNodeNumbers();
});

socket.on('uiRemoveNode', function(_nodeId) {
  for(let i in dataSet.nodes)
  {
    if(dataSet.nodes[i].id===_nodeId)
      dataSet.nodes.splice(i,1);
  }
  for(let i in dataSet.links)
  {
    if((dataSet.links[i].source.id===_nodeId)||(dataSet.links[i].target.id===_nodeId))
      dataSet.links.splice(i,1);
  }
  console.log("uiRemoveNode dataSet: ",dataSet);
  createGraph();
  updateNodeNumbers();
});

socket.on('uiNodeParentChanged', function(_node) {
  let _entry = JSON.parse(_node);
  for(let i in dataSet.links)
  {
    if(dataSet.links[i].source.id===_entry.id)
    {
      dataSet.links.splice(i,1);
      dataSet.links.push({"source":_entry.id, "target":_entry.pId});
      break;
    }
  }
  console.log("uiNodeParentChanged dataSet: ",dataSet);
  createGraph();
});

socket.on('sendNodeInfo', function(_data) {

  let _nodeInfo = JSON.parse(_data);
  let popup = d3.select("#node-info");
  popup.html(function(){
        let info = "";
        for(let i in _nodeInfo)
        {
          if(i === 'LAST HEARD')
            info += "<strong>"+i+":</strong> "+_nodeInfo[i]+" seconds ago<br />";
          else
            info += "<strong>"+i+":</strong> "+_nodeInfo[i]+"<br />";
        }
        return info;
      })
      .style("left", (selectedNode.x-popup.node().getBoundingClientRect().width)+"px")
      .style("top", (selectedNode.y-popup.node().getBoundingClientRect().height/2)+"px")
  showPopup(true);
})

socket.on('uiAddLog', function(_log){
  eventLogs.unshift(_log);

  d3.select("#logTable").html(function(){
    let res = "";
    for(let i in eventLogs)
    {
      res+="<tr><td>"+eventLogs[i]+"</tr></td>";
    }
    return res;
  })
});

socket.on('otaStatus', function(_data) {

  let _entryFound = false;
  for(let i=0; i<fotaNodes.length; i++)
  {
    if(fotaNodes[i].id===_data.id)
    {
      if(_data.state==="DOWNLOADING")
      {
        fotaNodes[i].endAngle = _data.percent*3.6*(Math.PI/180);
        d3.select("#f"+fotaNodes[i].id).attr("d", arc);
        _entryFound = true;
      }
      else
      {
        fotaNodes.splice(i, 1);
        createGraph();
      }
    }
  }
  if(!_entryFound && _data.state==="DOWNLOADING")
  {
    fotaNodes.push({id: _data.id, endAngle: _data.percent*3.6*(Math.PI/180)});
    createGraph();
  }
});
/*--------------------------------------------------------------------------------*/
/*  GRAPH UTILITY FUNCTIONS   */
function getNode(_nodeId)
{
  for(let i in dataSet.nodes)
  {
    if(dataSet.nodes[i].id===_nodeId)
      return (dataSet.nodes[i]);
  }
  return null;
}

function getLink(source, target)
{
  for(let i in dataSet.links)
  {
    if((dataSet.links[i].source.id === source) && (dataSet.links[i].target.id === target))
      return (dataSet.links[i]);
  }
  return null;
}

function updateNodeNumbers()
{
  d3.select("#nodeCount").text("NODES: "+dataSet.nodes.length);
}

function countSubLinks(_source){
  let _count = 0;
  for(let i=0; i<dataSet.links.length; i++)
    if(dataSet.links[i].target===_source) _count++;
  // console.log((('id' in _source)?_source.id:source)+" is connected to "+_count+" links.");
  return _count;
}

function getRootNode()
{
  for(let i=0; i<dataSet.nodes.length; i++)
  {
    if(dataSet.nodes[i].group==='ROOT') return dataSet.nodes[i];
  }
}

function getRootLinkDist()
{
  return Math.abs( COLLIDE_RADIUS / ( Math.tan( Math.PI/Math.max(countSubLinks(getRootNode()),5))));
}
/*--------------------------------------------------------------------------------*/