import cv2
import subprocess
import argparse

def process_image(input_file, output_file, resize_factor=1.0, grayscale=False):
    """
    Processes the image: resizing and optionally converting to grayscale.

    Args:
        input_file (str): Path to the input image file.
        output_file (str): Path to save the processed image.
        resize_factor (float): Scaling factor for resizing the image.
        grayscale (bool): Whether to convert the image to grayscale.

    Returns:
        str: Path to the processed image file.
    """
    try:
        # Load the image
        image = cv2.imread(input_file)
        if image is None:
            raise FileNotFoundError(f"Image file not found: {input_file}")

        # Resize the image
        width = int(image.shape[1] * resize_factor)
        height = int(image.shape[0] * resize_factor)
        resized_image = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)

        # Convert to grayscale if needed
        if grayscale:
            resized_image = cv2.cvtColor(resized_image, cv2.COLOR_BGR2GRAY)

        # Save the processed image
        cv2.imwrite(output_file, resized_image)
        print(f"Image processed and saved to: {output_file}")

        return output_file
    except Exception as e:
        print(f"Error processing image: {e}")
        raise



def print_image(file_path, printer_name="Canon_SELPHY_CP1500"):
    """
    Sends the processed image to the printer.
    """

    try:
        # Send to printer using lp command
        subprocess.run(["lp", "-d", printer_name, file_path], check=True)
        print(f"Photo sent to printer ({printer_name}) successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Failed to print: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")


if __name__ == "__main__":
    # Set up argument parsing
    parser = argparse.ArgumentParser(description="Process and optionally print photos.")
    parser.add_argument("--input", default="last_composed_image.jpg", help="Path to the input image file.")
    parser.add_argument("--output", default="processed_image.jpg", help="Path to save the processed image file.")
    parser.add_argument("--resize", type=float, default=1.0, help="Resize factor (default: 1.0, no resizing).")
    parser.add_argument("--grayscale", action="store_true", help="Convert the image to grayscale.")
    parser.add_argument("--printer", default="Canon_SELPHY_CP1500", help="Printer name.")
    parser.add_argument("--print", action="store_true", help="Send the processed image to the printer.")

    args = parser.parse_args()

    # Process the image
    processed_file = process_image(args.input, args.output, args.resize, args.grayscale)

    # Print the image if --print flag is set
    if args.print:
        print_image(processed_file, args.printer)




# Example Usage:

# Process only (no printing):
# python3 print_photo.py --output test_image.jpg --resize 0.8

# Process and print:
# python3 print_photo.py --print

# Custom Resize, Grayscale, and Print:
# python3 print_photo.py --resize 0.8 --grayscale --print