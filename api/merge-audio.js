export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { downloadURL, prospectName, timestamp } = req.body;
    
    if (!downloadURL || !prospectName || !timestamp) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    const sanitizedName = prospectName.replace(/[^a-zA-Z0-9]/g, '_');
    
    console.log('Processing audio for:', prospectName);
    console.log('Download URL:', downloadURL);
    
    // Step 1: Upload greeting to get its public_id
    const greetingPayload = {
      file: downloadURL,
      upload_preset: 'audio_merge',
      public_id: `greeting_${sanitizedName}_${Date.now()}`,
      resource_type: 'video'
    };

    console.log('Uploading greeting...');

    const greetingResponse = await fetch('https://api.cloudinary.com/v1_1/df12eghmr/video/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(greetingPayload)
    });

    if (!greetingResponse.ok) {
      const errorText = await greetingResponse.text();
      console.error('Greeting upload failed:', errorText);
      return res.status(500).json({
        status: 'error',
        error: `Greeting upload failed: ${errorText}`
      });
    }

    const greetingResult = await greetingResponse.json();
    console.log('Greeting uploaded successfully');
    console.log('Greeting duration:', greetingResult.duration, 'seconds');
    console.log('Greeting public_id:', greetingResult.public_id);

    // Step 2: Create concatenation using proper transformation URL
    const BASE_SCRIPT_PUBLIC_ID = '2025-07-15_16.55.08_oxotfl';
    
    // Build the concatenation URL: Add fade and slight volume decrease to greeting
    const concatenationUrl = `https://res.cloudinary.com/df12eghmr/video/upload/l_video:${greetingResult.public_id},e_volume:85,e_fade:200,so_0,eo_${Math.ceil(greetingResult.duration)}/fl_layer_apply/f_mp3/${BASE_SCRIPT_PUBLIC_ID}.mp3`;
    
    console.log('Generated concatenation URL:', concatenationUrl);
    console.log('Expected total duration:', greetingResult.duration + ' + base script duration');

    // Step 3: "Upload" the concatenated result (Cloudinary will generate it)
    const finalPayload = {
      file: concatenationUrl,
      upload_preset: 'audio_merge',
      public_id: `${sanitizedName}_full_voice_note_${timestamp}`,
      resource_type: 'video'
    };

    console.log('Creating final concatenated audio...');

    const finalResponse = await fetch('https://api.cloudinary.com/v1_1/df12eghmr/video/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload)
    });

    if (!finalResponse.ok) {
      const errorText = await finalResponse.text();
      console.error('Final concatenation failed:', errorText);
      
      // If concatenation fails, try direct URL approach
      console.log('Trying direct concatenation URL...');
      return res.status(200).json({
        status: 'success',
        mergedAudioUrl: concatenationUrl,
        publicId: `${sanitizedName}_direct_${timestamp}`,
        fileName: `${sanitizedName}_voice_note_${timestamp}.mp3`,
        duration: 'calculated_on_delivery',
        greetingDuration: greetingResult.duration,
        message: `Direct concatenation URL created for ${prospectName}`
      });
    }

    const finalResult = await finalResponse.json();
    console.log('Final concatenated audio created successfully');
    console.log('Final duration:', finalResult.duration, 'seconds');
    console.log('Final URL:', finalResult.secure_url);

    // Step 4: Clean up temporary greeting file (optional)
    try {
      if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        await fetch(`https://api.cloudinary.com/v1_1/df12eghmr/video/destroy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            public_id: greetingResult.public_id,
            resource_type: 'video',
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
          })
        });
        console.log('Temporary greeting file cleaned up');
      }
    } catch (cleanupError) {
      console.log('Cleanup warning (not critical):', cleanupError.message);
    }

    return res.status(200).json({
      status: 'success',
      mergedAudioUrl: finalResult.secure_url,
      publicId: finalResult.public_id,
      fileName: `${sanitizedName}_voice_note_${timestamp}.mp3`,
      duration: finalResult.duration,
      greetingDuration: greetingResult.duration,
      message: `Successfully merged audio for ${prospectName}. Final duration: ${finalResult.duration}s`
    });

  } catch (error) {
    console.error('Audio merge error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message,
      message: 'Failed to merge audio files'
    });
  }
}
