import cv2
from flask import Flask, Response, send_from_directory, request, jsonify
from flask_cors import CORS
import base64
import subprocess
import os
import time

app = Flask(__name__)
CORS(app)

# Directory to store archived photos
ARCHIVE_DIR = 'archive'

# Ensure the archive directory exists
if not os.path.exists(ARCHIVE_DIR):
    os.makedirs(ARCHIVE_DIR)

camera = cv2.VideoCapture(1)

import cv2

def list_available_cameras():
    """Print a list of available camera indices."""
    index = 0
    available_cameras = []

    while True:
        cap = cv2.VideoCapture(index)
        if cap.read()[0]:  # Check if the camera is accessible
            available_cameras.append(index)
        else:
            break
        cap.release()
        index += 1

    return available_cameras


def generate_frames():
    # camera = cv2.VideoCapture(1)
    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            # frame = cv2.flip(frame, 1)
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

        # subprocess.run(["lp", "-d", "Xerox_R__C230_Color_Printer", "captured_photo.jpg"], check=True)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Route to save the current frame as an image
@app.route('/capture', methods=['GET'])
def capture():
    success, frame = camera.read()
    if not success:
        return jsonify({"error": "Failed to capture image"}), 500
    
    # Flip the frame horizontally (mirror effect)
    # frame = cv2.flip(frame, 1)

    # Save the image to a file
    file_path = os.path.join(os.getcwd(), 'captured_photo.jpg')
    cv2.imwrite(file_path, frame)
    return jsonify({"message": f"Image saved successfully at {file_path}"}), 200
    
@app.route('/save_photos', methods=['POST'])
def save_photos():
    try:
        data = request.json
        # print("Received data:", data)  # Debug: Log received payload

        photos = data.get('photos', [])
        composed_image = data.get('composed_image')  # Debug: Log composed image
        # print("Composed Image:", composed_image)

        if not photos:
            return jsonify({"success": False, "message": "No photos provided"}), 400

        # Create a timestamped folder
        timestamp = time.strftime('%Y%m%d_%H%M%S')
        folder_path = os.path.join(ARCHIVE_DIR, timestamp)
        os.makedirs(folder_path, exist_ok=True)

        # Save each individual photo
        for index, photo in enumerate(photos):
            photo_data = photo.split(',')[1]  # Remove the data URL prefix
            file_path = os.path.join(folder_path, f'photo_{index + 1}.jpg')

            with open(file_path, 'wb') as file:
                file.write(base64.b64decode(photo_data))

        # Save the final composed image
        if composed_image:
            composed_image_data = composed_image.split(',')[1]
            composed_image_path = os.path.join(folder_path, 'composed_image.jpg')

            with open(composed_image_path, 'wb') as file:
                file.write(base64.b64decode(composed_image_data))

        return jsonify({"success": True, "folder": folder_path}), 200
    except Exception as e:
        print("Error:", str(e))  # Debug: Log errors
        return jsonify({"success": False, "message": str(e)}), 500
    
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

if __name__ == "__main__":
    print("Detecting available cameras...")
    cameras = list_available_cameras()
    if cameras:
        print(f"Available cameras: {cameras}")
    else:
        print("No cameras found.")

    app.run(host="0.0.0.0", port=8083)
