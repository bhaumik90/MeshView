var moment = require('moment');
var fs = require('fs');
var logStream = fs.createWriteStream(__dirname+'/mv.log',{flags: 'a', encoding: 'utf8'});

function writeLog(type, _log)
{
  logStream.write("["+moment().format('YYYY-MM-DD HH:mm:ss')+"] "+type+": "+_log);
  logStream.write("\n");
  return;
}

module.exports = {
  info:   function(_info)   { writeLog('INFO', _info);   },
  error:  function(_error)  { writeLog('ERROR', _error); },
}