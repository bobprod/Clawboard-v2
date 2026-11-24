"""Worker STT persistant (faster-whisper).

Charge le modele UNE SEULE FOIS, puis transcrit des fichiers en continu.
Protocole (JSON lines, stdin/stdout) :

  stdin :  {"file": "<chemin audio>", "lang": "fr", "prompt": "..."}
  stdout : {"ready": true, "model": "..."}                       (au demarrage)
           {"text": "...", "language": "fr", "duration": 1.2}   (resultat)
           {"error": "..."}                                     (erreur)
"""

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="small")
    parser.add_argument("--prompt", default=None)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"faster-whisper absent: {exc}"}), flush=True)
        return 2

    # Chargement du modele (une seule fois)
    try:
        model = WhisperModel(
            args.model, device=args.device, compute_type=args.compute_type
        )
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"chargement modele: {exc}"}), flush=True)
        return 1

    print(json.dumps({"ready": True, "model": args.model}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:  # noqa: BLE001
            print(json.dumps({"error": "json invalide"}), flush=True)
            continue

        file = req.get("file")
        if not file:
            print(json.dumps({"error": "file manquant"}), flush=True)
            continue

        try:
            segments, info = model.transcribe(
                file,
                language=req.get("lang") or None,
                vad_filter=True,
                beam_size=1,
                initial_prompt=req.get("prompt") or args.prompt or None,
            )
            text = " ".join(segment.text.strip() for segment in segments).strip()
            print(
                json.dumps(
                    {
                        "text": text,
                        "language": getattr(info, "language", None),
                        "duration": getattr(info, "duration", None),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"error": str(exc)}), flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
