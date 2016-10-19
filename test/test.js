var chai = require('chai');
var chaiHttp = require('chai-http');
var server = require('../server.js');

var should = chai.should();
var app = server.app;

chai.use(chaiHttp);


describe('List Shows', function() {
    
    //Return 200 on Home    
    it('listShow Endpoint good', function(done){
        chai.request(app)
            .get('/listShow')
            .end(function(error, response){
                response.should.have.status(200);
                done();
            });
    });
    
});