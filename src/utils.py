from PIL import Image, ImageEnhance, ImageFilter

def get_default_params():
    return {
        "brightness": 1.08,
        "contrast": 1.15,
        "sharpness": 1.0,
        "shadow_opacity": 0.15, # 0.0 to 1.0
        "shadow_blur": 15,
        "shadow_offset_x": 0,
        "shadow_offset_y": 10,
    }

def apply_glow_up(img, params=None):
    """
    Applies lighting, shine, and action-shot polish based on parameters.
    Args:
        img: PIL Image (RGBA) - expecting background to be already removed or transparent.
        params: dict of parameters (brightness, contrast, sharpness, shadow settings).
    """
    if params is None:
        params = get_default_params()

    # Ensure image is RGBA
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    # Work on a copy to avoid modifying original
    processed = img.copy()

    # 1. Lighting Boost
    if params.get("brightness", 1.0) != 1.0:
        enhancer = ImageEnhance.Brightness(processed)
        processed = enhancer.enhance(params["brightness"])

    # 2. Shine/Contrast Pop
    if params.get("contrast", 1.0) != 1.0:
        enhancer = ImageEnhance.Contrast(processed)
        processed = enhancer.enhance(params["contrast"])

    # 3. Sharpness
    if params.get("sharpness", 1.0) != 1.0:
        enhancer = ImageEnhance.Sharpness(processed)
        processed = enhancer.enhance(params["sharpness"])

    # 4. Action Shot: Grounding Shadow
    # Calculate canvas size
    # We add padding to accommodate shadow and "breathing room"
    padding = 100
    canvas_width = processed.width + padding
    canvas_height = processed.height + padding

    canvas = Image.new("RGBA", (canvas_width, canvas_height), (255, 255, 255, 0))

    # Create shadow
    shadow_opacity = params.get("shadow_opacity", 0.15)
    if shadow_opacity > 0:
        shadow = Image.new("RGBA", processed.size, (0, 0, 0, 0))
        # Use alpha channel as mask for shadow
        shadow_mask = processed.split()[3].point(lambda x: x * shadow_opacity)
        shadow.paste((0, 0, 0, 255), mask=shadow_mask)

        # Blur shadow
        blur_radius = params.get("shadow_blur", 15)
        if blur_radius > 0:
            shadow = shadow.filter(ImageFilter.GaussianBlur(radius=blur_radius))

        # Position shadow
        # Centered in canvas + offset
        x_pos = (canvas_width - processed.width) // 2
        y_pos = (canvas_height - processed.height) // 2

        shadow_x = x_pos + params.get("shadow_offset_x", 0)
        shadow_y = y_pos + params.get("shadow_offset_y", 10)

        canvas.paste(shadow, (int(shadow_x), int(shadow_y)), shadow)

    # Paste Object
    # Center object
    obj_x = (canvas_width - processed.width) // 2
    obj_y = (canvas_height - processed.height) // 2
    canvas.paste(processed, (obj_x, obj_y), processed)

    return canvas
