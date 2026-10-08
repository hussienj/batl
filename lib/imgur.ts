export async function uploadToImgur(file: File): Promise<string> {
    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('https://api.imgur.com/3/image', {
            method: 'POST',
            headers: {
                Authorization: 'Client-ID c3e819fa8ae9b17', // Anonymous Imgur Client-ID
            },
            body: formData,
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data?.link) {
                return result.data.link;
            }
        }
    } catch (error) {
        console.warn('Imgur API upload failed, using fallback data URL:', error);
    }

    // Fallback: Convert to Base64 data URL
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
    });
}
