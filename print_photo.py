import cv2
import subprocess

def process_and_print_photo():
    # Load the captured image
    image = cv2.imread("captured_photo.jpg")

    # Resize the image to 50%
    width = int(image.shape[1] * 0.5)
    height = int(image.shape[0] * 0.5)
    resized_image = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)

    # Convert to grayscale (optional for black & white)
    grayscale_image = cv2.cvtColor(resized_image, cv2.COLOR_BGR2GRAY)

    # Save the processed image back to a file
    cv2.imwrite("captured_photo_resized.jpg", grayscale_image)

    # Send the processed image to the printer
    printer_name = "Xerox_R__C230_Color_Printer"
    try:
        subprocess.run(["lp", "-d", printer_name, "captured_photo_resized.jpg"], check=True)
        print("Photo sent to printer successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Failed to print: {e}")

if __name__ == "__main__":
    process_and_print_photo()
