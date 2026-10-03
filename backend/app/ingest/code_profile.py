"""Summarize a source-code archive (.zip) by code, without sending code to the LLM."""

import io
import json
import re
import zipfile
from collections import Counter
from pathlib import PurePosixPath

from app.documents import DocumentError
from app.schemas.attachments import CodeProfile

MAX_ENTRIES = 5_000
MAX_UNCOMPRESSED = 100 * 1024 * 1024
MAX_FILE_FOR_LINES = 1024 * 1024
SKIP_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    "target",
    "bin",
    "obj",
    ".next",
}

LANGUAGES = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".java": "Java",
    ".kt": "Kotlin",
    ".cs": "C#",
    ".go": "Go",
    ".rb": "Ruby",
    ".php": "PHP",
    ".swift": "Swift",
    ".c": "C",
    ".cpp": "C++",
    ".h": "C/C++",
    ".rs": "Rust",
    ".scala": "Scala",
    ".sql": "SQL",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "CSS",
    ".vue": "Vue",
    ".dart": "Dart",
    ".r": "R",
    ".ipynb": "Jupyter",
}

FRAMEWORK_HINTS = {
    "package.json": {
        "react": "React",
        "vue": "Vue",
        "@angular/core": "Angular",
        "next": "Next.js",
        "express": "Express",
        "@nestjs/core": "NestJS",
        "langchain": "LangChain",
    },
    "requirements.txt": {
        "django": "Django",
        "flask": "Flask",
        "fastapi": "FastAPI",
        "pandas": "pandas",
        "torch": "PyTorch",
        "tensorflow": "TensorFlow",
        "scikit-learn": "scikit-learn",
        "langchain": "LangChain",
        "openai": "OpenAI SDK",
    },
    "pom.xml": {"spring-boot": "Spring Boot", "spring": "Spring"},
    "build.gradle": {"spring-boot": "Spring Boot", "android": "Android"},
    "composer.json": {"laravel": "Laravel", "symfony": "Symfony"},
    "go.mod": {"gin-gonic": "Gin", "echo": "Echo"},
}


def _skip(path: PurePosixPath) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def profile_zip(data: bytes) -> CodeProfile:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise DocumentError("File .zip bị lỗi.") from exc
    infos = [i for i in archive.infolist() if not i.is_dir()]
    if len(infos) > MAX_ENTRIES:
        raise DocumentError(f"Archive có quá nhiều file (tối đa {MAX_ENTRIES}).")
    if sum(i.file_size for i in infos) > MAX_UNCOMPRESSED:
        raise DocumentError("Archive giải nén quá lớn (tối đa 100 MB).")

    paths = [PurePosixPath(i.filename) for i in infos]
    roots = {p.parts[0] for p in paths if len(p.parts) > 1}
    strip_root = len(roots) == 1 and all(len(p.parts) > 1 for p in paths)

    lines: Counter[str] = Counter()
    frameworks: set[str] = set()
    top_dirs: Counter[str] = Counter()
    files = 0
    has_tests = has_docker = False
    for info, path in zip(infos, paths, strict=True):
        rel = PurePosixPath(*path.parts[1:]) if strip_root else path
        if _skip(rel) or not rel.parts:
            continue
        files += 1
        if len(rel.parts) > 1:
            top_dirs[rel.parts[0]] += 1
        name = rel.name.lower()
        if re.search(
            r"(^|/)(tests?|__tests__|spec)(/|$)|_test\.|\.test\.|\.spec\.", str(rel).lower()
        ):
            has_tests = True
        if name in {"dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml"}:
            has_docker = True
        lang = LANGUAGES.get(rel.suffix.lower())
        if lang and info.file_size <= MAX_FILE_FOR_LINES:
            content = archive.read(info).decode("utf-8", errors="ignore")
            lines[lang] += sum(1 for line in content.splitlines() if line.strip())
        manifest = (
            name
            if name in FRAMEWORK_HINTS
            else ("build.gradle" if name.startswith("build.gradle") else None)
        )
        if manifest and info.file_size <= MAX_FILE_FOR_LINES:
            text = archive.read(info).decode("utf-8", errors="ignore").lower()
            if manifest == "package.json":
                try:
                    pkg = json.loads(text)
                    text = " ".join(
                        {**pkg.get("dependencies", {}), **pkg.get("devdependencies", {})}
                    )
                except (json.JSONDecodeError, AttributeError):
                    pass
            frameworks.update(
                label for key, label in FRAMEWORK_HINTS[manifest].items() if key in text
            )
        if name.endswith(".csproj"):
            frameworks.add(".NET")

    notes = []
    if not has_tests:
        notes.append("Không thấy test tự động.")
    if has_docker:
        notes.append("Có Dockerfile/docker-compose, thuận lợi cho triển khai.")
    if not lines:
        notes.append("Không nhận diện được file mã nguồn.")
    return CodeProfile(
        files=files,
        total_lines=sum(lines.values()),
        languages=dict(lines.most_common(8)),
        frameworks=sorted(frameworks),
        top_dirs=[d for d, _ in top_dirs.most_common(8)],
        has_tests=has_tests,
        has_docker=has_docker,
        notes=notes,
    )
