import os
import sys
import json
from google import genai
from google.genai import types
from pydantic import BaseModel

# Initialize the client
client = genai.Client()

class FileEdit(BaseModel):
    file_path: str
    new_code: str
    summary_of_changes: str # Added to track what the AI actually did

def edit_files(prompt, file_paths):
    files_content = ""
    summary_report = "### AI Edit Report\n\n"
    
    # Read files
    for path in file_paths:
        try:
            with open(path, 'r') as file:
                code = file.read()
                files_content += f"\n--- {path} ---\n{code}\n"
        except FileNotFoundError:
            error_msg = f"❌ **Error:** File '{path}' not found. It was ignored.\n"
            print(error_msg)
            summary_report += error_msg
            continue

    if not files_content:
        fatal_error = "❌ **Fatal Error:** None of the specified files were found. No changes made."
        print(fatal_error)
        sys.exit(1)

    instruction = (
        "You are an automated code editor. You will receive a request and the code for one or more files. "
        "Modify the code according to the request. You must output the full modified code for each file "
        "and a brief 1-sentence summary of what you changed in that file."
    )

    full_prompt = f"Request: {prompt}\n\nCurrent Code for files:\n{files_content}"

    try:
        # Call Gemini
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=full_prompt,
            config=types.GenerateContentConfig(
                system_instruction=instruction,
                temperature=0.2,
                response_mime_type="application/json", 
                response_schema=list[FileEdit] 
            )
        )

        edits = json.loads(response.text)
        
        # Save files and build report
        for edit in edits:
            path = edit['file_path']
            new_code = edit['new_code']
            change_summary = edit['summary_of_changes']
            
            with open(path, 'w') as file:
                file.write(new_code)
                
            success_msg = f"✅ **{path}:** {change_summary}\n"
            print(success_msg)
            summary_report += success_msg

        # Print the final report block so GitHub Actions can capture it
        print("===REPORT_START===")
        print(summary_report)
        print("===REPORT_END===")

    except Exception as e:
        error_msg = f"❌ **API Error:** Failed to execute Gemini API. Details: {str(e)}"
        print(error_msg)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("❌ **Error:** Missing arguments. Usage: python ai_editor.py <prompt> <file_path>")
        sys.exit(1)

    prompt_text = sys.argv[1]
    target_files = sys.argv[2:]
    
    edit_files(prompt_text, target_files)
