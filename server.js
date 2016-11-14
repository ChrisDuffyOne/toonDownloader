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

//Socket.io
var clientIDs = []; //NONSOCKET
var toonDownloadList = [];
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
  
  //getEpisodes
  function getEpisodes(urlData){
    request(urlData, function(error, response, body){
      if(!error && response.statusCode == 200){
        var numCapturedEpisodes = 0;
        var $ = cheerio.load(body);
        $('li a', '.videolist').each(function(){
          var episodeName = this.children[3].children[0].data;
          var episodeLink = this.attribs.href;
          urls.push({name: episodeName, url: episodeLink});
          numCapturedEpisodes++;
        });
          
        //load the next page Else send all episodes back to client
        if(numCapturedEpisodes > 0){
            
          //Extract page number
          var pageStart = urlData.search('videos-') + 7;
          var pageEnd = urlData.search('-date');
          var pageLength = pageEnd - pageStart;
            
          //Increment page number
          var currentPage = Number(urlData.substr(pageStart, pageLength));
          var nextPage = currentPage + 1;
            
          //concat page string
          var videoConcat = 'videos-';
          var currentPageString = videoConcat.concat(currentPage);
          var nextPageString = videoConcat.concat(nextPage);
            
          //Generate next page
          var nextPageUrl = urlData.replace(RegExp(currentPageString, "g"), nextPageString);
          getEpisodes(nextPageUrl);
        }else{
          res.status(200).json(urls);
        }
      }
    });
  }
  getEpisodes(req.body.urlData);
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
  
  //Gen Client Id NONSOCKET
  function genClientId(){
    
    //generate random hex
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for(var i=0; i < 8; i++){
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    
    //make sure it isn't a duplicate
    for(var i=0; i < clientIDs.length; i++){
        if(text === clientIDs[i]){
            genClientId();
        }
    }
    return text;
  }
  
  var clientDLid = genClientId();
  io.to(socket.id).emit('clientID', clientDLid);
  
  //Ready Download List
  socket.on('downloadBatch', function(downloadBatchInfo) {
    toonDownloadList.push({socketID: socket.id, clientId: downloadBatchInfo.client , clientList: downloadBatchInfo.list});
    io.to(socket.id).emit('downloadReady', 'Youre download is ready');
  });
  
  //Route: Send Video Download to client
  app.get('/downloadEpisode/:socketRef/:videoRef', function(req, res){
  
    var videoToDownload;
    var socketIDcallback;

    for(var i=0; i<toonDownloadList.length; i++){
      if(toonDownloadList[i].clientId === req.params.socketRef){
        for(var k=0; k<toonDownloadList[i].clientList.length; k++){
          if(toonDownloadList[i].clientList[k].fileID === req.params.videoRef){
            socketIDcallback = toonDownloadList[i].socketID;
            videoToDownload = (toonDownloadList[i].clientList[k].fileUrl).replace(/\\/g, '');
            console.log('Found Video ID');
            break;
          }else{
            console.log('Not Found Video ID');
          }
        }
      }
    }
    
    //Stream Video to User
    var videoToDownloadStr = videoToDownload.toString();
    var retryDownload;

    var options = {
      method: 'GET',
      uri: videoToDownloadStr
    };
    request(options)
      .on('response' ,function(response){
        console.log('TOSTRING:VideoRequest: ',videoToDownload);
        console.log('VideoResCode: ',response.statusCode);
        console.log('VideoResType: ',response.headers['content-type']);
        
        //Video Retry
        if(response.statusCode === 520 || response.statusCode === 522){
          retryDownload = true;
        }else{
          retryDownload = false;
        }
      })
      //DEBUG
      /*.on('end', function(response){ //Works on cloud9 but doesn't totally work on heroku
      //.on('close', function(response){ //Works on cloud9, doesn't work on Heroku at all
        console.log('THE REQUEST HAS ENDED');
        if(retryDownload === false){
          console.log('VideoReqEnd: Ended Normally');
          io.to(socketIDcallback).emit('requestNext', 'Next Download');
          console.log('-----------------------------------------------');
        }else if(retryDownload === true){
          setTimeout(function(){
            console.log('VideoReqEnd: Returned 520 or 522');
            io.to(socketIDcallback).emit('requestRetry', 'Retry Download');
            console.log('-----------------------------------------------');
          }, 5000);
        }
      })*/
      .pipe(res);
    
    //Request Next/Retry Video  
    req.on("end", function(){
      if(retryDownload === false){
        console.log('REQ_End: Ended Normally');
        console.log('Next Video on this ID:,', socketIDcallback);
        io.to(socketIDcallback).emit('requestNext', 'Next Download');
        console.log('-----------------------------------------------');
      }else if(retryDownload === true){
        setTimeout(function(){
          console.log('REQ_End: Returned 520 or 522');
          io.to(socketIDcallback).emit('requestRetry', 'Retry Download');
          console.log('-----------------------------------------------');
        }, 5000);
      }
    });
    
  });

});

//Mocha Test Exports
exports.app = app;

server.listen(process.env.PORT || 8080); 
console.log('ToonIs Downloader: Online: Revision: Req_Try');