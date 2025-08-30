function randomizeTextByNewlines(text) {
    // Split the text into an array of lines
    const lines = text.split('\n');
    
    // Fisher-Yates shuffle algorithm to randomize the lines
    for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lines[i], lines[j]] = [lines[j], lines[i]];
    }
    
    // Join the shuffled lines back together
    return lines.join('\n');
}

// Function to generate 7 variants by randomizing the text
function generateTextVariants(originalText) {
    const variants = [];
    
    for (let i = 0; i < 7; i++) {
        variants.push(randomizeTextByNewlines(originalText));
    }
    
    return variants;
}


export default  generateTextVariants