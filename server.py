import cv2
from flask import Flask, Response

app = Flask(__name__)

def generate_frames():
    # Access Camo Camera (replace "0" with the correct device index for Camo)
    camera = cv2.VideoCapture(1)  # Use the right index for your Camo virtual camera

    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            # Encode frame to JPEG
            _, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()

            # Yield frames for streaming
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/stream')
def stream():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8083)
