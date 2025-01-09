import cv2
from flask import Flask, Response, send_from_directory, request, jsonify
from flask_cors import CORS
import base64
import subprocess

app = Flask(__name__)
CORS(app)

def generate_frames():
    camera = cv2.VideoCapture(1)
    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            frame = cv2.flip(frame, 1)
            _, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/stream')
def stream():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/print', methods=['POST'])
def print_photo():
    data = request.get_json()
    snapshot_data = data.get('snapshot', '')
    if not snapshot_data:
        return jsonify({"success": False, "error": "No snapshot data provided"}), 400

    try:
        header, encoded = snapshot_data.split(',', 1)
        image_data = base64.b64decode(encoded)
        with open("captured_photo.jpg", "wb") as f:
            f.write(image_data)

        subprocess.run(["lp", "-d", "Xerox_R__C230_Color_Printer", "captured_photo.jpg"], check=True)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8083)
