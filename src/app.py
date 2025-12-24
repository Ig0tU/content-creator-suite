import streamlit as st
import io
import zipfile
import re
from PIL import Image
from rembg import remove
from utils import apply_glow_up, get_default_params

# --- App Config ---
st.set_page_config(page_title="Professional Product Glow-Up Studio", layout="wide")
st.title("✨ Professional Product Glow-Up Studio")
st.markdown("Upload product photos to automatically remove backgrounds and add studio-quality lighting and effects. Use the chat to fine-tune the results.")

# --- Session State ---
if "edit_history" not in st.session_state:
    st.session_state.edit_history = []
if "source_images" not in st.session_state:
    st.session_state.source_images = {} # Stores {filename: PIL.Image (No BG)}
if "image_params" not in st.session_state:
    st.session_state.image_params = {} # Stores {filename: dict_of_params}
if "processed_images" not in st.session_state:
    st.session_state.processed_images = {} # Stores {filename: PIL.Image (Final)}

# --- Helper Logic ---
def update_all_images():
    """Regenerates all images based on current parameters."""
    for name, raw_img in st.session_state.source_images.items():
        params = st.session_state.image_params.get(name, get_default_params())
        st.session_state.processed_images[name] = apply_glow_up(raw_img, params)

def parse_chat_command(command):
    """Parses natural language commands to update parameters."""
    command = command.lower()

    # Split command into segments to handle compound requests (e.g. "more brightness and less shadow")
    segments = re.split(r',|\sand\s|\.\s', command)

    updates = {}
    response_parts = []

    # Keyword Mapping
    # (parameter_key, increase_keywords, decrease_keywords, step_size)
    adjustments = [
        ("brightness", ["bright", "light", "illumination"], ["dark", "dim"], 0.05),
        ("contrast", ["contrast", "pop", "vibrant"], ["flat", "dull"], 0.05),
        ("sharpness", ["sharp", "detail", "clear"], ["soft", "blur"], 0.2),
        ("shadow_opacity", ["shadow", "grounding"], ["no shadow", "remove shadow", "less shadow", "lighter shadow"], 0.05),
        ("shadow_blur", ["softer shadow", "diffuse"], ["hard shadow", "sharp shadow"], 2.0),
    ]

    decrease_modifiers = ["less", "no", "remove", "decrease", "lower", "reduce"]

    for segment in segments:
        segment = segment.strip()
        if not segment: continue

        for param, inc_words, dec_words, step in adjustments:
            # Check for explicitly negative keywords first (e.g. "darker", "softer")
            if any(w in segment for w in dec_words):
                 updates[param] = updates.get(param, 0) - step
                 response_parts.append(f"decreased {param.replace('_', ' ')}")
                 continue

            # Check for positive keywords (e.g. "brightness", "shadow")
            if any(w in segment for w in inc_words):
                # Check for modifiers within this segment only
                if any(mod in segment for mod in decrease_modifiers):
                    updates[param] = updates.get(param, 0) - step
                    response_parts.append(f"decreased {param.replace('_', ' ')}")
                else:
                    updates[param] = updates.get(param, 0) + step
                    response_parts.append(f"increased {param.replace('_', ' ')}")

    return updates, response_parts

# --- Sidebar: File Handling ---
with st.sidebar:
    st.header("1. Upload Photos")
    uploaded_files = st.file_uploader("Upload product images", type=['png', 'jpg', 'jpeg', 'webp'], accept_multiple_files=True)

    st.header("2. Global Settings")
    if st.button("Reset All"):
        st.session_state.source_images = {}
        st.session_state.image_params = {}
        st.session_state.processed_images = {}
        st.session_state.edit_history = []
        st.rerun()

# --- Main Interface ---
if uploaded_files:
    # Process new files
    # We only process if they are not already in session state or if explicitly re-run
    # To keep it simple, if the list changes we might need to handle it, but for now relies on button

    new_files_detected = False
    for f in uploaded_files:
        if f.name not in st.session_state.source_images:
            new_files_detected = True
            break

    if new_files_detected:
        if st.button("🚀 Run Product Glow-Up"):
            with st.spinner("Removing backgrounds & applying studio effects..."):
                for file in uploaded_files:
                    if file.name not in st.session_state.source_images:
                        raw_img = Image.open(file).convert("RGBA")
                        # Phase 1: Background Removal
                        no_bg = remove(raw_img)
                        st.session_state.source_images[file.name] = no_bg
                        st.session_state.image_params[file.name] = get_default_params()

                update_all_images()

    # Display Results
    if st.session_state.processed_images:
        st.subheader("Studio Gallery")
        display_cols = st.columns(4)
        for idx, (name, img) in enumerate(st.session_state.processed_images.items()):
            with display_cols[idx % 4]:
                st.image(img, caption=name, use_container_width=True)

    # --- Chat-Based Micro Editor ---
    st.divider()
    st.subheader("💬 Micro Editor")
    st.caption("Instruct the AI to adjust lighting, shadows, or contrast. (e.g., 'Make them brighter', 'Soften the shadows')")

    chat_input = st.chat_input("Enter your adjustment request...")

    if chat_input:
        st.session_state.edit_history.append({"role": "user", "content": chat_input})

        # Parse and Apply
        param_updates, actions = parse_chat_command(chat_input)

        if param_updates:
            count = 0
            for name in st.session_state.image_params:
                current_params = st.session_state.image_params[name]
                for key, delta in param_updates.items():
                    current_params[key] = max(0.0, current_params.get(key, 0) + delta) # Prevent negative values
                    # Special caps
                    if key == "shadow_opacity": current_params[key] = min(1.0, current_params[key])

                st.session_state.image_params[name] = current_params
                count += 1

            update_all_images()
            response_msg = f"Applied adjustments: {', '.join(actions)} to {count} images."
        else:
            response_msg = "I couldn't detect a specific visual parameter to adjust. Try keywords like 'brightness', 'shadow', 'contrast', or 'sharpness'."

        st.session_state.edit_history.append({"role": "assistant", "content": response_msg})

    # Show Chat History
    for msg in st.session_state.edit_history:
        with st.chat_message(msg["role"]):
            st.write(msg["content"])

    # --- Export as ZIP ---
    if st.session_state.processed_images:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w") as zf:
            for name, img in st.session_state.processed_images.items():
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                zf.writestr(f"glowup_{name}.png", buf.getvalue())

        st.download_button(
            label="🎁 Download Professional Catalog (.zip)",
            data=zip_buffer.getvalue(),
            file_name="Product_Catalog_GlowUp.zip",
            mime="application/zip"
        )
else:
    st.info("Upload your product images in the sidebar to begin.")
