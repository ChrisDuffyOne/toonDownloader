var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var fs = require('fs');

var path = require('path');
var mime = require('mime');

//Web Scraping
var request = require('request');
var cheerio = require('cheerio');

//Home Static
app.use(bodyParser.json());
app.use(express.static('public'));

//DEBUG Socket.io
var toonDownloadList = []; //DEBUG
var socket_io = require('socket.io');
var server = http.Server(app);
var io = socket_io(server);

//Route: Get Series List
app.get('/listShow', function(req, res){
  console.log('listShow Endpoint');
  var urls = [];
  
  request('http://www.toon.is', function(error, response, body){
    if(!error && response.statusCode == 200){
      var $ = cheerio.load(body);
      $('li a', '.hasdropdown #ul_categories').each(function(){
        urls.push({name: $(this).html(), url: $(this).attr('href')});
      });
      
      res.status(200).json(urls);
    }
  });
});

//Route: Get Episode List
app.post('/listEpisode', function(req, res){
  var urls = [];
  
  request(req.body.urlData, function(error, response, body){
    if(!error && response.statusCode == 200){
      var $ = cheerio.load(body);
      $('li a', '.videolist').each(function(){
        
        var episodeName = this.children[3].children[0].data;
        var episodeLink = this.attribs.href;
        urls.push({name: episodeName, url: episodeLink});
      });
      res.status(200).json(urls);
    }
  });
  
});

//Route: Get Video File Url
app.post('/getMp4Url', function(req, res){
  
  var scriptArray = [];
  
  request(req.body.getUrl, function(error, response, body){
    if(!error && response.statusCode == 200){
      var $ = cheerio.load(body);
      $('script').each(function(){
        scriptArray.push(this);
      });
      
      var flashVarCopy = scriptArray[4].children[0].data;
      
      //Find start and end to file path
      var fileStart = flashVarCopy.search('file: ')+ 7;
      var fileEnd = flashVarCopy.search('.mp4') + 4;
      var fileLength = fileEnd - fileStart;
      
      //Splice out the file path and remove backslashes
      var urlExtract = flashVarCopy.substr(fileStart, fileLength);
      var urlExtractEscaped = urlExtract.replace(/\\/g, '');
       
       var returnURLinfo = {filePath: urlExtractEscaped, refHTML: req.body.getUrl};
       res.status(200).json(returnURLinfo);
    }
  });
});

//Socket.io Downloader
io.on('connection', function(socket){
  
  //Send client their socket id
  var downloadId = socket.id;
  io.to(downloadId).emit('clientID', downloadId);
  
  socket.on('downloadBatch', function(downloadList) {
        toonDownloadList.push({clientId: downloadId, clientList: downloadList});
        io.to(downloadId).emit('downloadReady', 'Youre download is ready');
  });
  
  //Route: Send Video Download to client
  app.get('/downloadEpisode/:socketRef/:videoRef', function(req, res){
  
    var videoToDownload;
    req.params.socketRef = "/#" + req.params.socketRef;
    
    
    for(var i=0; i<toonDownloadList.length; i++){
      if(toonDownloadList[i].clientId === req.params.socketRef){
        
        for(var k=0; k<toonDownloadList[i].clientList.length; k++){
          if(toonDownloadList[i].clientList[k].fileID === req.params.videoRef){
            videoToDownload = (toonDownloadList[i].clientList[k].fileUrl).replace(/\\/g, '');
            console.log('Found Video ID');
          }
        }
      }
    }
    
    //Start Video Download:
    //request(videoToDownload).pipe(res); //THIS WORKS!
    
    //DEBUG Start Video Download Error check:
    request
      .get(videoToDownload)
      .on('error' ,function(err){
        console.log('VideoRequest: ',videoToDownload);
        console.log('VideoRequestError: ',err);
      })
      .pipe(res);
    
    
    //issue request for next video
    req.on("close", function() { 
      console.log('Connection: Closed Unexpectly');
      io.to(req.params.socketRef).emit('requestRetry', 'Retry Download');
    });
    req.on("end", function() { 
      console.log('Connection: Ended Normally'); 
      io.to(req.params.socketRef).emit('requestNext', 'Next Download');
    });
  });
  
});

//Mocha Test Exports
exports.app = app;

server.listen(process.env.PORT || 8080); 
console.log('ToonIs Downloader: Online');