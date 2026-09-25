FROM postgres:17-alpine

COPY infra/postgres-backup/backup-entrypoint.sh /usr/local/bin/system112-backup

RUN chmod 0555 /usr/local/bin/system112-backup

ENTRYPOINT ["system112-backup"]
CMD ["schedule"]
