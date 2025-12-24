import pytest
from PIL import Image
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../src'))
from utils import apply_glow_up, get_default_params

def test_apply_glow_up_default():
    # Create a dummy RGBA image
    img = Image.new("RGBA", (100, 100), (255, 0, 0, 255))

    # Apply default glow up
    result = apply_glow_up(img)

    # Check if result is an image
    assert isinstance(result, Image.Image)
    # Check dimensions (should be larger due to padding)
    assert result.width > 100
    assert result.height > 100

def test_apply_glow_up_custom_params():
    img = Image.new("RGBA", (100, 100), (255, 0, 0, 255))

    # Different params
    params1 = get_default_params()
    params1["brightness"] = 0.5 # Darker

    params2 = get_default_params()
    params2["brightness"] = 2.0 # Brighter

    res1 = apply_glow_up(img, params1)
    res2 = apply_glow_up(img, params2)

    # Check that results are different (comparing raw bytes or pixel values)
    # Brightness change should affect pixel values
    assert list(res1.getdata()) != list(res2.getdata())

def test_shadow_disable():
    img = Image.new("RGBA", (100, 100), (255, 0, 0, 255))
    params = get_default_params()
    params["shadow_opacity"] = 0.0

    res = apply_glow_up(img, params)

    # If shadow is 0, we expect just the padded canvas with the image.
    # We can check specific pixels where shadow would be (e.g. bottom area)
    # The image is red (255, 0, 0, 255)
    # The canvas is transparent (0,0,0,0) or white if we changed it, but code says transparent.

    # Center pixel should be red
    center_x = res.width // 2
    center_y = res.height // 2
    assert res.getpixel((center_x, center_y)) == (255, 0, 0, 255)

    # Pixel far bottom left should be transparent if shadow is disabled
    # (Shadow usually offset to bottom right or bottom center)
    # Check alpha channel is 0
    assert res.getpixel((10, res.height - 10))[3] == 0
