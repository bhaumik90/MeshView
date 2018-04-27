/*--------------------------------------------------------------------------------*/
/*  CoAP CLIENT  */
var coap;

function sendCoapRequest(_uri, _payload=null, _blockwise=false, _blockOptVal=0x0)
{
  let _this = this;
  let coapReq = coap.request({host: this.nodeAddr, method: 'PUT', pathname: _uri, retrySend: 0})
      .on('response', function(res) { 
        otaProcessResponse(_this, res);
        res.on('end', function(){ process.exit(0) }); 
      })
      .on('error', function(err){ console.error(err); });

  coapReq.setOption("Content-Format", "application/octet-stream");
  if(_blockwise) coapReq.setOption('Block1', _blockOptVal);
  if(_payload!==null) coapReq.write(_payload);
  coapReq.end();
}
/*--------------------------------------------------------------------------------*/
/*  HELPER FUNCTIONS  */
function constructBlockOption()
{
  let _more = (this.nextBlockNumber===this.lastBlockNumber)?0x00:0x08;
  let _optValue;

  if(this.nextBlockNumber<=0x0F)
  {
    _optValue = new Buffer.from([(this.nextBlockNumber&0x0F)<<4|_more|0x2]);
  }
  else if(this.nextBlockNumber>0x0F && this.nextBlockNumber<=0x0FFF)
  {
    _optValue = new Buffer.from([(this.nextBlockNumber&0xFFF0)>>4, (this.nextBlockNumber&0x000F)<<4|_more|0x2]);
  }
  return _optValue;
}

function sendNextBlock()
{
  let _this = this;
  let _data;
  if((this.nextBlockNumber===this.lastBlockNumber) && (this.otaImage.length%this.chunkSize))
  {
    _data = new Buffer.allocUnsafe(_this.otaImage.length%_this.chunkSize).fill(0);
    _this.otaImage.copy(_data, 0, _this.nextBlockNumber*_this.chunkSize, _this.nextBlockNumber*_this.chunkSize+(_this.otaImage.length%_this.chunkSize));
  }
  else 
  {
    _data = new Buffer.allocUnsafe(_this.chunkSize).fill(0);
    _this.otaImage.copy(_data, 0, _this.nextBlockNumber*_this.chunkSize, (_this.nextBlockNumber+1)*_this.chunkSize);
  }
  sendCoapRequest.call(this, '5/1', _data, true, constructBlockOption.call(this));
}
/*--------------------------------------------------------------------------------*/
function fota(_ipAddr, _img)
{
  this.nodeAddr = _ipAddr;
  this.otaImage = _img;
  this.otaState = "INITIATED";
  this.chunkSize = 64;
  this.lastBlockNumber = (_img.length%64)?(Math.floor(_img.length/64)):(_img.length/4-1);
  this.nextBlockNumber = 0;
  sendCoapRequest.call(this, '5/0');
}

function otaProcessResponse(_this, _response)
{
  if(_response.code.split('.')[0]==='4' || _response.code.split('.')[0]==='5') process.exit(0);
  if(_this.otaState==="DOWNLOADING" && _this.nextBlockNumber<_this.lastBlockNumber && _response.code.split('.')[0]==='2' && _response.code.split('.')[1]==='31')
  {
    if(_response.options[2].name==="Block1")
    {
      _this.nextBlockNumber = (_response.options[2].value.readUIntBE(0, _response.options[2].value.length)>>4) + 1;
    }
    sendNextBlock.call(_this);
  }
  else if(_this.otaState==="DOWNLOADING" && _response.code.split('.')[0]==='2' && _response.code.split('.')[1]==='04')
  {
    _this.otaState = "IDLE";
  }
}

fota.prototype.handleRequest = function(_request)
{
  var _this = this;
  if(_request.url==="/5/0" && _this.otaState==="INITIATED")
  {
    _this.otaState = "DOWNLOADING";
    _this.nextBlockNumber=0;
    sendNextBlock.call(_this);
  }
}
/*--------------------------------------------------------------------------------*/
module.exports = function(_coapInstance) {
  if(_coapInstance===null || _coapInstance===undefined) return null;
  coap = _coapInstance;
  return fota;
}