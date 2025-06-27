
import os
import logging
from datetime import datetime

def setup_logger():
    # Create logs directory if it doesn't exist
    logs_dir = 'logs'
    if not os.path.exists(logs_dir):
        os.makedirs(logs_dir)

    # Create a unique log filename with timestamp
    log_filename = os.path.join(logs_dir, f'api_test_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')

    # Create a logger
    logger = logging.getLogger('API_Testing')
    logger.setLevel(logging.INFO)

    # Create handlers
    file_handler = logging.FileHandler(log_filename)
    console_handler = logging.StreamHandler()

    # Create formatters and add it to handlers
    log_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(log_format)
    console_handler.setFormatter(log_format)

    # Add handlers to the logger
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger

# Create a global logger instance
logger = setup_logger()