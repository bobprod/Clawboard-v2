import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--model", default="base")
    parser.add_argument("--lang", default=None)
    parser.add_argument("--prompt", default=None)
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"faster-whisper absent: {exc}"}))
        return 2

    try:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            args.audio,
            language=args.lang or None,
            vad_filter=True,
            beam_size=1,
            initial_prompt=args.prompt or None,
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
            )
        )
        return 0
    except Exception as exc:  # noqa: BLE001
        import traceback

        print(json.dumps({"error": str(exc), "traceback": traceback.format_exc()[-2500:]}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
