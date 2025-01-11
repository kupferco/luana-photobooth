const stream = document.getElementById('stream');
const snapshotElement = document.getElementById('snapshot');
const countdown = document.getElementById('countdown');
const takePhotoBtn = document.getElementById('take-photo');
const printBtn = document.getElementById('print-button');
const cancelBtn = document.getElementById('cancel-button');
const messageDiv = document.getElementById('message');

// Define the initial welcome message
const welcomeMessage = "On start, 4 photos will be taken\nafter a countdown from 3!! :-)";

// Display the welcome message on page load
document.addEventListener('DOMContentLoaded', () => {
    messageDiv.style.display = 'block'; // Ensure it's visible
    messageDiv.style.opacity = '1'; // Ensure no opacity transitions apply initially
    showInstruction(welcomeMessage, 0); // Show indefinitely
    takePhotoBtn.style.display = 'block'; // Ensure the Start button is visible
});


window.addEventListener('resize', () => {
    const snapshotElement = document.getElementById('snapshot');
    if (snapshotElement.style.display === 'block') {
        const aspectRatio = 16 / 9;
        const width = snapshotElement.parentElement.offsetWidth;
        const height = width / aspectRatio;

        snapshotElement.style.width = `${width}px`;
        snapshotElement.style.height = `${height}px`;
    }
});


let snapshots = [];
let captureIndex = 0;

const countDownDelay = 500;
const previewDelay = 1000;

// Handle the Start button click
takePhotoBtn.addEventListener('click', () => {
    messageDiv.style.display = 'none'; // Hide the welcome message
    startPhotoSequence(); // Start the photo sequence
});


async function startPhotoSequence() {
    snapshots = [];
    captureIndex = 0;
    takePhotoBtn.style.display = 'none';
    capturePhotoSequence();
}

function capturePhotoSequence() {
    if (captureIndex < 4) {
        startCountdown(3, async () => {
            const snapshot = takeSnapshot();
            if (snapshot) {
                snapshots.push(snapshot);
                displaySnapshotPreview(snapshot);
                await delay(previewDelay);
                snapshotElement.style.display = 'none';
                stream.style.display = 'block';
            } else {
                console.error('Failed to capture snapshot.');
            }

            if (++captureIndex < 4) {
                capturePhotoSequence(); // Continue to the next photo
            } else {
                showFinalImage(); // Show the final composed image
            }
        });
    }
}


function startCountdown(seconds, onComplete) {
    if (seconds <= 0) {
        countdown.style.display = 'none'; // Hide countdown after completion
        onComplete(); // Call the callback after the countdown ends
        return;
    }

    countdown.style.display = 'flex'; // Ensure countdown is visible
    countdown.style.opacity = '1'; // Reset opacity to make it visible
    countdown.innerText = seconds; // Update the number

    // Apply the animation programmatically
    countdown.style.animation = 'none'; // Reset the animation
    void countdown.offsetWidth; // Force reflow to restart animation
    countdown.style.animation = `fade-grow ${countDownDelay / 1000}s ease-out`;

    setTimeout(() => {
        countdown.style.opacity = '0'; // Fade out after animation
        startCountdown(seconds - 1, onComplete); // Proceed to the next number
        // setTimeout(() => {
        // }, 300); // Allow fade-out to complete before moving to the next step
    }, countDownDelay); // Match the delay with animation timing
}



function captureSnapshot() {
    const snapshot = takeSnapshot(); // High-quality snapshot
    if (snapshot) {
        snapshots.push(snapshot); // Save for composition
        displaySnapshotPreview(snapshot); // Display resized preview
    } else {
        console.error('Failed to capture snapshot.');
    }
}


function flashScreen() {
    countdown.style.background = 'white';
    setTimeout(() => {
        countdown.style.background = '';
    }, 100);
}

async function savePhotos(composedImage) {
    console.log("Saving photos and composed image...");
    // console.log("Snapshots:", snapshots);
    // console.log("Composed Image:", composedImage);

    const response = await fetch('http://192.168.1.105:8083/save_photos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            photos: snapshots,
            composed_image: composedImage
        }),
    });

    const result = await response.json();
    if (result.success) {
        console.log(`Photos saved to folder: ${result.folder}`);
    } else {
        console.error(`Error saving photos: ${result.message}`);
    }
}


async function showFinalImage() {
    const composedImage = await composeFinalImage(); // Wait for the composed image
    displayComposedImage(composedImage);

    savePhotos(composedImage); // Save the composed image along with individual photos

    printBtn.style.display = 'block';
    cancelBtn.style.display = 'block';
}


function composeFinalImage() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Set final print resolution (1200 x 1800 for 4x6 at 300 dpi)
    const canvasWidth = 1800; // Width of the final canvas
    const canvasHeight = 1200; // Height of the final canvas
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Load the background image
    const background = new Image();
    background.src = './static/background.jpg'; // Assumes background.jpg is in the static folder

    return new Promise((resolve) => {
        background.onload = () => {
            // Draw the background
            context.drawImage(background, 0, 0, canvasWidth, canvasHeight);

            // Dimensions for "Photo 4" (large top image)
            const largePhotoWidth = canvasWidth * 0.7; // 70% of canvas width
            const largePhotoHeight = largePhotoWidth * (2 / 3); // Maintain 3:2 aspect ratio
            const largePhotoX = canvasWidth * 0.02;
            const largePhotoY = canvasHeight * 0.04;

            // Draw the large photo (Photo 4)
            const photo4 = new Image();
            photo4.src = snapshots[3]; // Last photo
            photo4.onload = () => {
                context.drawImage(photo4, largePhotoX, largePhotoY, largePhotoWidth, largePhotoHeight);

                // Dimensions for smaller photos
                const smallPhotoWidth = canvasWidth * 0.2; // 20% of canvas width
                const smallPhotoHeight = smallPhotoWidth * (2 / 3); // Maintain 3:2 aspect ratio
                const smallPhotoY = canvasHeight * 0.775;

                // Create promises for smaller photos
                const smallPhotosPromises = snapshots.slice(0, 3).map((src, index) => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.src = src;

                        img.onload = () => {
                            const smallPhotoX =
                                canvasWidth * 0.02 + index * (smallPhotoWidth + canvasWidth * 0.05); // Spaced evenly

                            context.drawImage(
                                img,
                                smallPhotoX,
                                smallPhotoY,
                                smallPhotoWidth,
                                smallPhotoHeight
                            );

                            resolve(); // Resolve once the image is drawn
                        };

                        img.onerror = () => {
                            console.error(`Failed to load image for photo ${index + 1}`);
                            resolve(); // Resolve even if there's an error
                        };
                    });
                });

                // Wait for all small photos to load and draw before resolving the final image
                Promise.all(smallPhotosPromises).then(() => {
                    resolve(canvas.toDataURL('image/jpeg'));
                });
            };

            photo4.onerror = () => {
                console.error('Failed to load the large photo.');
                resolve(canvas.toDataURL('image/jpeg')); // Resolve even if the large photo fails
            };
        };

        background.onerror = () => {
            console.error('Failed to load the background image.');
            resolve(canvas.toDataURL('image/jpeg')); // Resolve even if the background fails
        };
    });
}




function displaySnapshotPreview(snapshot) {
    const snapshotElement = document.getElementById('snapshot'); // Image preview element
    snapshotElement.src = snapshot;

    // Resize to 16:9 for display purposes
    const aspectRatio = 16 / 9;
    const width = snapshotElement.parentElement.offsetWidth; // Use the parent container's width
    const height = width / aspectRatio;

    snapshotElement.style.width = `${width}px`;
    snapshotElement.style.height = `${height}px`;

    snapshotElement.style.display = 'block'; // Show the preview
    stream.style.display = 'none'; // Hide the stream
}




// Function to display the composed image over the stream
function displayComposedImage(composedImage) {
    const snapshotElement = document.getElementById('snapshot'); // Image preview element
    snapshotElement.src = composedImage;

    // Resize to 16:9 for display purposes
    const aspectRatio = 16 / 9;
    const width = snapshotElement.parentElement.offsetWidth; // Use the parent container's width
    const height = width / aspectRatio;

    snapshotElement.style.width = `${width}px`;
    snapshotElement.style.height = `${height}px`;

    snapshotElement.style.display = 'block'; // Show the composed image preview
    stream.style.display = 'none'; // Hide the stream
}






function takeSnapshot() {
    const img = document.querySelector('#stream'); // Select the image element

    if (!img.complete) {
        console.error('Stream image is not fully loaded yet.');
        return null; // Return null to avoid errors
    }

    // Create a canvas with the same resolution as the image
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = imgWidth;
    canvas.height = imgHeight;

    // Draw the image onto the canvas
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0, imgWidth, imgHeight);

    // Get the snapshot as a base64-encoded image
    return canvas.toDataURL('image/jpeg');
}


function showInstruction(message, duration = 3000) {
    messageDiv.innerText = message;
    messageDiv.style.display = 'block';
    messageDiv.style.opacity = '1'; // Ensure it becomes visible

    // Only hide the message if a positive duration is provided
    if (duration > 0) {
        setTimeout(() => {
            messageDiv.style.opacity = '0'; // Fade out
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 300); // Ensure fade-out completes
        }, duration);
    }
}




function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

printBtn.addEventListener('click', async () => {
    showInstruction('Sending photo to printer...', 0); // Keep the message visible until further updates
    try {
        const response = await fetch('http://192.168.1.105:8083/prints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ snapshot: snapshots[snapshots.length - 1] }), // Send final image
        });
        const result = await response.json();
        if (result.success) {
            showInstruction('Photo sent to printer!');
        } else {
            showInstruction('Failed to print the photo.');
        }
    } catch (error) {
        showInstruction('Error sending photo to printer.');
    }

    setTimeout(() => {
        resetUI();
    }, 3000); // Reset UI after 3 seconds
});


cancelBtn.addEventListener('click', resetUI);

function resetUI() {
    snapshots = [];
    snapshotElement.style.display = 'none';
    stream.style.display = 'block'; // Show the stream again
    takePhotoBtn.style.display = 'block'; // Show the Start button
    printBtn.style.display = 'none';
    cancelBtn.style.display = 'none';

    // Display the welcome message again
    showInstruction(welcomeMessage, 0); // Show indefinitely
}