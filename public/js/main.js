console.log('ToonIs Main: Online');
var socket = io();
var socketDownloadId; 

var VideoList = function() {
    this.downloadIndex = 0;
    this.videos = [];
    this.episodes = [];
    this.downloadList = [];
    this.mp4Urls = [];
    this.getVideoList();
    this.socketEvents();
};

//-----------Get TV Series List-----------//
VideoList.prototype.getVideoList = function(){
    var ajax = $.ajax('/listShow', {
        type: 'GET',
        dataType: 'json'
    });
    ajax.done(this.getVideoListDone.bind(this));
};

VideoList.prototype.getVideoListDone = function(videos) {
    this.videos = videos;
    
    var displayVideos = [];
    $.each(videos, function(i, video) {
        displayVideos.push('<li><button type="button" class="tvShowButton" data="'+video.url+'">'+video.name+'</button></li>');
    });
    $('#videoList').append(displayVideos.join(''));
    
    //Get Episode List
    var videoList = this;
    $('#videoList li button').click(function(){
        var urlData = $(this).attr('data');
        videoList.getEpisodeList(urlData);
        $("html, body").animate({ scrollTop: "0px"});
    });
};

//-----------Get Episodes List-----------//
VideoList.prototype.getEpisodeList = function(urlData){
    var url = {'urlData': urlData};
    var ajax = $.ajax('/listEpisode', {
        type: 'POST',
        data: JSON.stringify(url),
        dataType: 'json',
        contentType: 'application/json'
    });
    ajax.done(this.getEpisodeListDone.bind(this));
};

VideoList.prototype.getEpisodeListDone = function(episodes){

    this.episodes = [];
     $('#episodeList').empty();
    
    this.episodes = episodes;
    episodes.reverse();
    
    var displayEpisodes = [];
    $.each(episodes, function(i, ep) {
        displayEpisodes.push('<li><button type="button" class="tvEpisodeButton" data="'+ep.url+'">'+ep.name+'</button></li>');
    });
    $('#episodeList').append(displayEpisodes.join(''));
    
    //Add episode to download cue
    var videoList = this;
    $('#episodeList li button').click(function(){
        var urlData = $(this).attr('data');
        var urlName = $(this).html();
        var episodeID = videoList.genEpisodeId(); //DEBUG
        
        //check if episode is a duplicate
        if(videoList.rmDupEpisode(urlName)){ console.log('DUPLICATE ENTRY!: REMOVED');}
        else{ videoList.downloadList.push({name: urlName, url: urlData, fileUrl: undefined, fileID: episodeID, retryNum: 0});}
        
        //fire off ajax request for mp4 url
        $(this).toggleClass("selectedEpisode");
        if($(this).hasClass("selectedEpisode")){
            var getUrl = {'getUrl': urlData};
            videoList.getFileUrl(getUrl);
        };
    });
};

//-----------get mp4 url and assign to download slot----------//
VideoList.prototype.getFileUrl = function(getUrl){
    var ajax = $.ajax('/getMp4Url', {
        type: 'POST',
        data: JSON.stringify(getUrl),
        dataType: 'json',
        contentType: 'application/json'
    });
    ajax.done(this.getFileUrlDone.bind(this));
}

VideoList.prototype.getFileUrlDone = function(fileUrl){
    for(var i=0; i<this.downloadList.length; i++){
        if(this.downloadList[i].url == fileUrl.refHTML){
            this.downloadList[i].fileUrl = fileUrl.filePath;
        }
    }
};

//-----------Helper Functions-----------//
VideoList.prototype.rmDupEpisode = function(episodeName){
    for(var i=0; i<this.downloadList.length; i++){
        if(this.downloadList[i].name === episodeName){
            this.downloadList.splice(i, 1);
            return true;
        }
    };
};


//-----------Socket.io events-----------//
VideoList.prototype.socketEvents = function(){
    var videoList = this;
    
    //Incoming Events
    socket.on('clientID', function(clientId){
            socketDownloadId = clientId;
    });
    socket.on('requestNext', function(){
            videoList.downloadIndex++;
            if(videoList.downloadIndex === videoList.downloadList.length){
                console.log('All Files Downloaded');
            }else{
                var testAutoClick = "#" + videoList.downloadList[videoList.downloadIndex].fileID;
                $(testAutoClick).get(0).click();
            }
    });
    socket.on('requestRetry', function(){
            
            //Retry request two additional else
            videoList.downloadList[videoList.downloadIndex].retryNum++;
            if(videoList.downloadList[videoList.downloadIndex].retryNum < 3){
                console.log('Retry Number:', videoList.downloadList[videoList.downloadIndex].retryNum);
                var testAutoClick = "#" + videoList.downloadList[videoList.downloadIndex].fileID;
                $(testAutoClick).get(0).click();
            }
            //Move onto next video
            else{
                videoList.downloadIndex++;
                if(videoList.downloadIndex === videoList.downloadList.length){
                    console.log('All Files Downloaded');
                }else{
                    var testAutoClick = "#" + videoList.downloadList[videoList.downloadIndex].fileID;
                    $(testAutoClick).get(0).click();
                }
            }
    });
    
    //Outgoing Events
    $('#downloadBatch').click(function(){
        
        console.log(videoList.downloadList); //DEBUG
        
        //generate a list of link downloads
        var downloadBatchList = [];
        for(var i=0; i<videoList.downloadList.length; i++){
            var fileUrl = videoList.downloadList[i].fileUrl;
            var fileID = videoList.downloadList[i].fileID;
            var fileName = videoList.downloadList[i].name;
            //Remove first two chars
            var urlSocketID = socketDownloadId.slice(2, (socketDownloadId.length));
            
            downloadBatchList.push('<li><a href="/downloadEpisode/'+urlSocketID+'/'+fileID+'/" id="'+fileID+'" download="'+fileName+'">Download'+i+'</a></li>'); //DEBUG
        }
        $('#downloadBatchHidden').append(downloadBatchList.join(''));
        socket.emit('downloadBatch', videoList.downloadList);
        
        // Start auto download
        socket.on('downloadReady', function(message){
            var testAutoClick = "#" + videoList.downloadList[videoList.downloadIndex].fileID;
            $(testAutoClick).get(0).click();
        });

    });
};

//-----------Generate episode id-----------//
VideoList.prototype.genEpisodeId = function(){
    //generate random hex
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for(var i=0; i < 8; i++){
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    
    //make sure it isn't a duplicate
    for(var i=0; i < this.downloadList.length; i++){
        if(text === this.downloadList[i].fileID){
            return this.genEpisodeId();
        }
    }
    return text;
}

function toonDownloader(){
    var contentList = new VideoList();
}

$(document).ready(function(){
    toonDownloader();
});