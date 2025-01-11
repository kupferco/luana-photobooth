import cv2
from flask import Flask, Response, send_from_directory, request, jsonify
from flask_cors import CORS
import base64
import subprocess
import os
import time
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
CORS(app)

# Directory to store archived photos
ARCHIVE_DIR = 'archive'

# Ensure the archive directory exists
if not os.path.exists(ARCHIVE_DIR):
    os.makedirs(ARCHIVE_DIR)

cameraIndex = 1
# camera = cv2.VideoCapture(cameraIndex)
global_camera = cv2.VideoCapture(cameraIndex)
# global_camera.release()


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
    local_camera = cv2.VideoCapture(cameraIndex)
    logging.info("Starting frame generation...")
    try:
        while True:
            success, frame = local_camera.read()
            if not success:
                logging.warning("Failed to read frame from the camera")
                time.sleep(0.1)
                continue
            # logging.debug("Frame captured successfully")
            _, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()
            # logging.debug("Frame encoded successfully")
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
    except Exception as e:
        logging.error("Error during frame generation: %s", e, exc_info=True)
    finally:
        local_camera.release()
        logging.info("Camera resource released after frame generation")


@app.route('/stream')
def stream():
    logging.info("Stream endpoint hit")
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/print', methods=['POST'])
def print_photo():
    data = request.get_json()
    snapshot_data = data.get('snapshot', '')
    if not snapshot_data:
        logging.error("No snapshot data provided in /print")
        return jsonify({"success": False, "error": "No snapshot data provided"}), 400

    try:
        header, encoded = snapshot_data.split(',', 1)
        image_data = base64.b64decode(encoded)
        with open("captured_photo.jpg", "wb") as f:
            f.write(image_data)

        logging.info("Photo saved as captured_photo.jpg")
        return jsonify({"success": True})
    except Exception as e:
        logging.error("Error processing /print: %s", e, exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/capture', methods=['GET'])
def capture():
    local_camera = cv2.VideoCapture(cameraIndex)
    success, frame = local_camera.read()
    if not success:
        logging.error("Failed to capture image in /capture")
        return jsonify({"error": "Failed to capture image"}), 500

    file_path = os.path.join(os.getcwd(), 'captured_photo.jpg')
    cv2.imwrite(file_path, frame)
    logging.info("Image captured and saved at %s", file_path)
    local_camera.release()
    return jsonify({"message": f"Image saved successfully at {file_path}"}), 200

@app.route('/save_photos', methods=['POST'])
def save_photos():
    try:
        data = request.json
        photos = data.get('photos', [])
        composed_image = data.get('composed_image')

        if not photos:
            logging.warning("No photos provided in /save_photos")
            return jsonify({"success": False, "message": "No photos provided"}), 400

        timestamp = time.strftime('%Y%m%d_%H%M%S')
        folder_path = os.path.join(ARCHIVE_DIR, timestamp)
        os.makedirs(folder_path, exist_ok=True)

        for index, photo in enumerate(photos):
            photo_data = photo.split(',')[1]
            file_path = os.path.join(folder_path, f'photo_{index + 1}.jpg')

            with open(file_path, 'wb') as file:
                file.write(base64.b64decode(photo_data))

        if composed_image:
            composed_image_data = composed_image.split(',')[1]
            composed_image_path = os.path.join(folder_path, 'composed_image.jpg')

            with open(composed_image_path, 'wb') as file:
                file.write(base64.b64decode(composed_image_data))

        logging.info("Photos saved successfully in folder %s", folder_path)
        return jsonify({"success": True, "folder": folder_path}), 200
    except Exception as e:
        logging.error("Error in /save_photos: %s", e, exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/')
def serve_index():
    logging.info("Serving index.html")
    return send_from_directory('.', 'index.html')

if __name__ == "__main__":
    logging.info("Detecting available cameras...")
    cameras = list_available_cameras()
    if cameras:
        logging.info("Available cameras: %s", cameras)
    else:
        logging.warning("No cameras found.")

    logging.info("Starting Flask server on port 8083")
    app.run(host="0.0.0.0", port=8083)
