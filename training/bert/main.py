import sys


def main():
    if len(sys.argv) < 2:
        print("Usage: python main.py [train|serve]")
        sys.exit(1)

    command = sys.argv[1]

    if command == "train":
        from train import train
        train()
    elif command == "serve":
        from serve import serve
        serve()
    elif command == "export-onnx":
        from export_onnx import export
        export()
    elif command == "augment":
        from augment_dataset import augment
        augment()
    else:
        print(f"Unknown command: {command}. Use 'train', 'serve', 'export-onnx', or 'augment'.")
        sys.exit(1)


if __name__ == "__main__":
    main()
