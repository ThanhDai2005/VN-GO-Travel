import os
import re

WORKSPACE = r"C:\Users\KHOA\source\repos\VN-GO-Travel6"
PRD_DIR = os.path.join(WORKSPACE, "prd")

# Regex to find method definitions in C# and JS
# C#: public async Task UpdateLocationAsync(
# JS: router.get('/summary', ...
# JS: async function doSomething(
CS_METHOD_PATTERN = re.compile(r'(?:public|private|internal|protected)?(?:\s+(?:async|static|override|virtual))?\s+(?:Task|void|[\w<>]+)\s+([A-Z][a-zA-Z0-9_]+)\s*\(')
JS_METHOD_PATTERN = re.compile(r'(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(')
JS_ROUTE_PATTERN = re.compile(r'router\.(get|post|put|delete)\([\'"]([/a-zA-Z0-9_:-]+)[\'"]')

# Dictionary to hold mapped methods: {"MethodName": ("path/to/file.cs", 42)}
method_map = {}
route_map = {}

print("Scanning codebase to build index...")
for root, dirs, files in os.walk(WORKSPACE):
    # skip irrelevant folders
    dirs[:] = [d for d in dirs if d not in ['node_modules', 'bin', 'obj', '.git', 'prd', 'docs', '.vs', 'contract-snapshots']]
    
    for file in files:
        if file.endswith('.cs') or file.endswith('.js') or file.endswith('.jsx'):
            filepath = os.path.join(root, file)
            rel_path = os.path.relpath(filepath, WORKSPACE).replace('\\', '/')
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    for i, line in enumerate(f):
                        if '.cs' in file:
                            m = CS_METHOD_PATTERN.search(line)
                            if m and not line.strip().endswith(';'):
                                method_name = m.group(1)
                                method_map[method_name] = (rel_path, i + 1)
                        elif '.js' in file or '.jsx' in file:
                            m = JS_METHOD_PATTERN.search(line)
                            if m:
                                method_name = m.group(1)
                                method_map[method_name] = (rel_path, i + 1)
                            m2 = JS_ROUTE_PATTERN.search(line)
                            if m2:
                                route_method = m2.group(1).upper()
                                route_path = m2.group(2)
                                route_map[f"{route_method} {route_path}"] = (rel_path, i + 1)
            except Exception:
                pass

print(f"Indexed {len(method_map)} methods and {len(route_map)} routes.")

# Regex to find potential methods in backticks like `ClassName.MethodName` or `MethodNameAsync`
METHOD_EXTRACT = re.compile(r'`([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?)`')
ROUTE_EXTRACT = re.compile(r'`(GET|POST|PUT|DELETE)\s+(/api/[a-zA-Z0-9_/-]+)`')

def process_file(filepath):
    print(f"Processing {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    for line in lines:
        new_lines.append(line)
        if not '`' in line:
            continue
            
        methods = METHOD_EXTRACT.findall(line)
        routes = ROUTE_EXTRACT.findall(line)
        
        notes = []
        for method in methods:
            if method in ['MainThread', 'true', 'false', 'null', 'Shell', 'AppState', 'Navigation', 'Audio', 'Id', 'Code']:
                continue
            
            search_key = method.split('.')[-1]
            if search_key in method_map:
                loc = method_map[search_key]
                notes.append(f"> *Vị trí: `{method}` nằm ở file `{loc[0]}`, dòng `{loc[1]}`*")
                
        for route_method, route_path in routes:
            # try to match route
            # route_path might be /api/admin/pois/:id/approve, but in backend it's /:id/approve in admin-poi.routes.js
            # Let's do a loose search
            found = False
            for k, v in route_map.items():
                if route_method in k and k.split(' ')[1] in route_path:
                    notes.append(f"> *Vị trí: `{route_method} {route_path}` nằm ở file `{v[0]}`, dòng `{v[1]}`*")
                    found = True
                    break
            if not found:
                # manual match logic or just skip
                pass

        if notes:
            unique_notes = list(dict.fromkeys(notes))
            new_lines.append('\n' + '\n'.join(unique_notes) + '\n')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

for root, dirs, files in os.walk(PRD_DIR):
    for file in files:
        if file.endswith('.md'):
            process_file(os.path.join(root, file))

print("Done!")
