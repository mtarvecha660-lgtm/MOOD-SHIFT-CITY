import os
import sys
from google import genai
from google.genai import types

# 1. Initialize the client. 
# It automatically picks up the GEMINI_API_KEY environment variable.
client = genai.Client()

def edit_file(prompt, file_path):
    # 2. Read the existing code safely.
    try:
        with open(file_path, 'r') as file:
            code = file.read()
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
        sys.exit(1)

    # 3. Define the instruction. We want raw code back, no markdown.
    instruction = (
        "You are an automated code editor. You will receive a request and code. "
        "Modify the code according to the request. Return ONLY raw executable code. "
        "Do NOT wrap output in markdown fences (no ```), do NOT add explanations."
    )

    full_prompt = f"Request: {prompt}\n\nCurrent Code:\n{code}"

    try:
        # 4. Make the call using the modern 3.6-flash model and config pattern
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=full_prompt,
            config=types.GenerateContentConfig(
                system_instruction=instruction,
                temperature=0.2,
            )
        )

        new_code = response.text.strip()

        # 5. Fallback: Clean up markdown backticks just in case the model ignores the instruction
        if new_code.startswith("```"):
            lines = new_code.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            new_code = "\n".join(lines)

        # 6. Save the modified file
        with open(file_path, 'w') as file:
            file.write(new_code)

        print(f"Successfully modified {file_path}")

    except Exception as e:
        print(f"Error executing Gemini API: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python ai_editor.py <prompt> <file_path>")
        sys.exit(1)

    edit_file(sys.argv[1], sys.argv[2])
