from http.server import HTTPServer, BaseHTTPRequestHandler
import os
import subprocess

class HTTPStatus:
    OK = 200
    NO_CONTENT = 204


class HelperHandler(BaseHTTPRequestHandler):
    def do_HEAD(s):
        s.send_response(HTTPStatus.OK)
        s.send_header("Content-type", "application/javascript")
        s.end_headers()

    def do_GET(s):
        HelperHandler.do_HEAD(s)
        result = subprocess.run(['curl', '-s',  '--unix-socket', '/var/run/docker.sock',  'http:/v1.24/' + 'containers/json'], stdout=subprocess.PIPE)
        jsonp = [bytearray('getContainers(', 'ascii'), bytearray(');', 'ascii')]
        s.wfile.write(jsonp[0] + result.stdout.rstrip() + jsonp[1])


server_port = int(os.getenv('VIS_HELPER_PORT', 8081))
server_address = ('', server_port)
httpd = HTTPServer(server_address, HelperHandler)
httpd.serve_forever()

