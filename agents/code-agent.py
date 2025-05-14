import os
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader

def index_codebase(directory: str, chroma_host: str, chroma_port: int):
    # Load all files from the directory recursively, excluding certain file types
    loader = DirectoryLoader(
        directory,
        glob="**/*.{ts,js,py,md,txt}",
        exclude=["**/node_modules/**", "**/dist/**", "**/.git/**"]
    )
    documents = loader.load()

    # Split documents into manageable chunks
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    texts = text_splitter.split_documents(documents)

    # Initialize OpenAI embeddings with API key from environment variables
    openai_api_key = os.getenv('OPENAI_API_KEY')
    if not openai_api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)

    # Connect to ChromaDB
    vectorstore = Chroma(
        collection_name="codebase",
        embedding_function=embeddings,
        host=chroma_host,
        port=chroma_port
    )

    # Insert documents into the vector store
    vectorstore.add_documents(texts)

if __name__ == "__main__":
    # Define the directory to index and ChromaDB connection details
    codebase_directory = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    chroma_host = os.getenv('CHROMADB_HOST', 'localhost')
    chroma_port = int(os.getenv('CHROMADB_PORT', 8000))

    # Index the codebase
    index_codebase(codebase_directory, chroma_host, chroma_port)
