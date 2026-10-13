from pathlib import Path


def main():
    project = Path(__file__).resolve().parents[1]
    output = project.parent
    preview = (project / "preview.html").read_text(encoding="utf-8")
    preview = preview.replace('"app/src/main/assets/index.html"', '"android-app/app/src/main/assets/index.html"')
    (output / "theme-showcase.html").write_text(preview, encoding="utf-8")
    destination = "android-app/app/src/main/assets/index.html"
    mobile = f'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>星运灵签</title>
<style>html,body,iframe{{width:100%;height:100%;margin:0;border:0;display:block;background:#030406;overflow:hidden}}</style></head>
<body><iframe src="{destination}" title="星运灵签"></iframe></body></html>
'''
    (output / "daily-fortune.html").write_text(mobile, encoding="utf-8")
    print("Updated previews from the canonical Android assets; no application source overwritten.")


if __name__ == "__main__":
    main()
