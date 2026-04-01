import structlog

structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(0),
    logger_factory=structlog.PrintLoggerFactory(),
)
