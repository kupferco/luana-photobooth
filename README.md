# Luana Photo Booth

Luana Photo Booth is a DIY photo booth application designed for events, allowing users to capture photos, compose a final layout, and print directly using a connected printer. It supports both testing and real printing modes.

---

## Features

- **Photo Capture**: Captures individual snapshots from a video feed.
- **Composed Layout**: Generates a final composed image with customizable layouts.
- **Printing Options**: Allows direct printing to a configured printer or saving a processed image for testing.
- **Fullscreen Mode**: Enables fullscreen mode for an immersive photo booth experience.
- **User-Friendly Interface**: Intuitive buttons for capturing, saving, and printing photos.

---

## Components

### 1. **Frontend (JavaScript)**
   - **`script.js`**:
     - Manages photo capture, layout composition, and sending data to the backend.
     - Stores the composed image in a global variable (`composedImageBase64`) for easy access.
     - Communicates with the backend for saving photos and printing.
   - **Key Functions**:
     - `composeFinalImage()`: Generates the final composed image.
     - `savePhotos(composedImage)`: Sends individual snapshots and the composed image to the backend for saving.
     - `printBtn Event Listener`: Sends the composed image to the `/print` endpoint for printing.

### 2. **Backend (Python - Flask)**
   - **`server.py`**:
     - Provides endpoints for saving photos, printing, and handling data from the frontend.
     - **Endpoints**:
       - `/save_photos`: Saves snapshots and the composed image to the archive and root folder.
       - `/print`: Sends the composed image to the printer or simulates printing in test mode.
   - **Integration**:
     - Uses the `print_photo.py` module for processing and printing images.

### 3. **Image Processing and Printing (Python)**
   - **`print_photo.py`**:
     - Handles image resizing, optional grayscale conversion, and printing.
     - Supports real printing or test output mode.

---

## Setup

### Prerequisites
- Python 3.x
- Node.js (for frontend dependencies if needed)
- Flask
- OpenCV (`cv2`)
- Printer with `lp` command support (e.g., Canon SELPHY CP1500)

### Installation

1. Clone the Repository:
   ```bash
   git clone <repository-url>
   cd luana-photobooth
   ```

2. Install Python Dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Start the Server:
   ```bash
   python3 server.py
   ```

4. Open the Frontend:
   - Access the photo booth interface in a browser at `http://<server-ip>:8083`.

---

## Usage

### Photo Booth Workflow
1. **Start the Application**:
   - Click **Start** to begin the photo session.

2. **Capture Photos**:
   - The system takes snapshots with a countdown and generates a composed layout.

3. **Save Photos**:
   - Photos are saved via the `/save_photos` endpoint:
     - Individual snapshots in a timestamped archive folder.
     - The composed image as `composed_image.jpg` (archived) and `last_composed_image.jpg` (root).

4. **Print Photos**:
   - Clicking **Print** sends the composed image to the `/print` endpoint.
   - The image is either printed directly or saved as `processed_image.jpg` in test mode.

---

## Endpoints

### `/save_photos` (POST)
**Description**: Saves snapshots and the composed image.

**Payload**:
```json
{
    "photos": ["base64_image_1", "base64_image_2", "base64_image_3"],
    "composed_image": "base64_composed_image"
}
```

**Response**:
- **Success**:
  ```json
  { "success": true, "folder": "<saved_folder_path>" }
  ```
- **Failure**:
  ```json
  { "success": false, "message": "<error_message>" }
  ```

---

### `/print` (POST)
**Description**: Prints or simulates printing of the composed image.

**Payload**:
```json
{
    "snapshot": "base64_composed_image"
}
```

**Response**:
- **Success**:
  ```json
  { "success": true }
  ```
- **Failure**:
  ```json
  { "success": false, "error": "<error_message>" }
  ```

---

## Configuration

### Testing Mode
Run the server in testing mode to skip actual printing:
```bash
python3 server.py --test-mode
```

### Printer Configuration
Set your printer name in `server.py` and `print_photo.py`:
```python
printer_name = "Canon_SELPHY_CP1500"
```

---

## Files and Directories

- **`server.py`**: Main Flask server.
- **`script.js`**: Frontend logic.
- **`print_photo.py`**: Handles image processing and printing.
- **`static/`**: Contains the frontend assets (e.g., `background.jpg`).
- **`last_composed_image.jpg`**: Most recent composed image (root).
- **`ARCHIVE_DIR/`**: Timestamped archives of saved photos.

---

## Troubleshooting

### Issue: Printer Not Responding
- Verify printer name with:
  ```bash
  lpstat -p
  ```
- Ensure `lp` is installed:
  ```bash
  sudo apt install cups
  ```

### Issue: Images Not Saving
- Check server logs for errors.
- Ensure the payload from the frontend contains valid base64-encoded images.

---

## Example Usage

### Process only (no printing):
```bash
python3 print_photo.py --output test_image.jpg --resize 0.8
```

### Process and print:
```bash
python3 print_photo.py --print
```

### Custom Resize, Grayscale, and Print:
```bash
python3 print_photo.py --resize 0.8 --grayscale --print
```

---

## Future Enhancements
- Add support for multiple layout templates.
- Allow users to send the composed image to their emails or mobiles

