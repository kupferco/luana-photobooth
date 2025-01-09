from flask import Flask, Response, send_from_directory
from flask_cors import CORS
import cv2

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Generate frames for the stream
def generate_frames():
    camera = cv2.VideoCapture(1)  # Use the correct device index for your Camo virtual camera
    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            # Encode the frame to JPEG
            _, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()

            # Yield frames for streaming
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

# Stream route
@app.route('/stream')
def stream():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

# Route to serve the HTML UI
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')  # Serve the index.html file from the root folder

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8083)
