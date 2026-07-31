import os
import sys
from google import genai
from google.genai import types

# Initialize the Gemini Client
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def edit_file(prompt, file_path):
    # Read existing code
    try:
        with open(file_path, 'r') as file:
            code = file.read()
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
        sys.exit(1)

    # Instruct Gemini to only return code
    sys_instruction = (
        "You are an automated code editor. You will receive a request and code. "
        "Modify the code according to the request. Return ONLY raw executable code. "
        "Do NOT wrap output in markdown fences (no ```), do NOT add explanations."
    )

    full_prompt = f"Request: {prompt}\n\nCurrent Code:\n{code}"

    try:
        # Call Gemini model
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=full_prompt,
            config=types.GenerateContentConfig(
                system_instruction=sys_instruction,
                temperature=0.2
            )
        )

        new_code = response.text.strip()

        # Clean up backticks if the model outputs markdown anyway
        if new_code.startswith("```"):
            lines = new_code.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            new_code = "\n".join(lines)

        # Save modified file
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
