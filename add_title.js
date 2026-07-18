const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let newContent = content;

      // Handle double quote placeholders
      newContent = newContent.replace(/<Select([^>]*?)placeholder="([^"]+)"([^>]*?)(>|\/>)/g, (match, p1, p2, p3, p4) => {
        if (match.includes('title=')) return match;
        return `<Select${p1}title="${p2}" placeholder="${p2}"${p3}${p4}`;
      });

      // Handle single quote placeholders
      newContent = newContent.replace(/<Select([^>]*?)placeholder='([^']+)'([^>]*?)(>|\/>)/g, (match, p1, p2, p3, p4) => {
        if (match.includes('title=')) return match;
        return `<Select${p1}title='${p2}' placeholder='${p2}'${p3}${p4}`;
      });

      // Handle curly brace string literal placeholders e.g. placeholder={"xyz"}
      newContent = newContent.replace(/<Select([^>]*?)placeholder=\{"([^"]+)"\}([^>]*?)(>|\/>)/g, (match, p1, p2, p3, p4) => {
        if (match.includes('title=')) return match;
        return `<Select${p1}title="${p2}" placeholder={"${p2}"}${p3}${p4}`;
      });
      
      // Handle expressions (with a simple heuristic, assuming it's short like agentPickerLabel ? "Branch" : "All")
      // Actually we have: placeholder={agentPickerLabel ? "Branch (agent filter)" : "All branches"}
      // It's safer to just match everything inside placeholder={...} if it's on the same line, or handle it manually.
      newContent = newContent.replace(/<Select([^>]*?)placeholder=\{([^}]+)\}([^>]*?)(>|\/>)/g, (match, p1, p2, p3, p4) => {
        if (match.includes('title=')) return match;
        return `<Select${p1}title={${p2}} placeholder={${p2}}${p3}${p4}`;
      });

      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log('Updated', fullPath);
      }
    }
  }
}
processDir('c:/Rudrayani_Fintech_2/frontend/src');
