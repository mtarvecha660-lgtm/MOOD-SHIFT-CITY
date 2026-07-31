import os
import sys
import time
from google import genai
from google.genai import types

# 1. Initialize the client. 
# It automatically picks up the GEMINI_API_KEY environment variable.
client = genai.Client()

def setup_file_search_store(repo_path="."):
    """Creates a File Search Store and uploads the repository files."""
    print("Setting up File Search Store...")
    
    # Create the store
    store = client.file_search_stores.create(
        config={
            "display_name": "repo-files",
            "embedding_model": "models/gemini-embedding-2", # Use the multimodal embedding model
        }
    )
    
    # Upload files (simplified example - you'd likely want to filter which files to upload)
    for root, dirs, files in os.walk(repo_path):
        # Exclude hidden directories like .git
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for file in files:
            file_path = os.path.join(root, file)
            # Basic check to only upload text-based files for this example
            if file_path.endswith(('.py', '.html', '.css', '.js', '.md', '.txt')):
                try:
                    client.file_search_stores.upload_to_file_search_store(
                        file=file_path,
                        file_search_store_name=store.name,
                        config={"display_name": file_path}
                    )
                    print(f"Uploaded {file_path} to store.")
                except Exception as e:
                     print(f"Skipping {file_path} - Error: {e}")
    
    # Wait for processing to finish (in a real app, check operation status)
    print("Waiting for files to be indexed...")
    time.sleep(10)
    return store

def find_file_to_edit(prompt, store):
    """Uses the File Search tool to ask Gemini which file needs to be edited."""
    print(f"Asking Gemini to find the relevant file for: '{prompt}'")
    
    # Create an interaction to use the File Search tool
    interaction = client.interactions.create(
        model="gemini-3.6-flash",
        input=f"The user wants to make this change: '{prompt}'. Based on the files in your search store, which file needs to be edited? Reply ONLY with the exact file path from the 'display_name' metadata. Do not include any other text.",
        tools=[{"type": "file_search", "file_search_store_names": [store.name]}]
    )
    
    # Extract the file path from the model's output
    target_file = None
    for step in interaction.steps:
        if step.type == 'model_output':
            for content_block in step.content:
                 if content_block.type == 'text':
                      target_file = content_block.text.strip()
                      break
    
    if not target_file or "not find" in target_file.lower():
         raise ValueError(f"Gemini could not determine which file to edit. Output: {target_file}")
         
    print(f"Gemini identified file: {target_file}")
    return target_file

def edit_file(prompt, file_path):
    """Edits the specified file (same as our previous script)."""
    try:
        with open(file_path, 'r') as file:
            code = file.read()
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found locally.")
        sys.exit(1)

    instruction = (
        "You are an automated code editor. You will receive a request and code. "
        "Modify the code according to the request. Return ONLY raw executable code. "
        "Do NOT wrap output in markdown fences (no ```), do NOT add explanations."
    )

    full_prompt = f"Request: {prompt}\n\nCurrent Code:\n{code}"

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=full_prompt,
            config=types.GenerateContentConfig(
                system_instruction=instruction,
                temperature=0.2,
            )
        )

        new_code = response.text.strip()

        if new_code.startswith("```"):
            lines = new_code.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            new_code = "\n".join(lines)

        with open(file_path, 'w') as file:
            file.write(new_code)

        print(f"Successfully modified {file_path}")

    except Exception as e:
        print(f"Error executing Gemini API during edit: {e}")
        sys.exit(1)

def cleanup_store(store):
    """Deletes the store to clean up."""
    print("Cleaning up File Search Store...")
    client.file_search_stores.delete(name=store.name)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python autonomous_editor.py <prompt>")
        sys.exit(1)

    prompt = sys.argv[1]
    
    # 1. Setup the store (Warning: doing this on every run is slow!)
    store = setup_file_search_store()
    
    try:
        # 2. Find the file
        target_file = find_file_to_edit(prompt, store)
        
        # 3. Edit the file
        edit_file(prompt, target_file)
    except Exception as e:
         print(f"Task Failed: {e}")
    finally:
         # 4. Clean up
         cleanup_store(store)
