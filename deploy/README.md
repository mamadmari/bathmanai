# Deploy layout (Germany, 193.36.84.150)

| App        | Server path        | Port (local) | systemd unit      | nginx vhost                    |
|------------|--------------------|--------------|-------------------|--------------------------------|
| site       | /var/www/bathmanai/site | –       | nginx             | bathmanai.ir, www              |
| blupaper   | /var/www/blupaper/site  | –       | nginx             | blupaper.bathmanai.ir          |
| clinic     | /opt/clinic        | 8788         | clinic.service    | clinic.bathmanai.ir            |
| cryptodesk | /opt/cryptodesk    | 8787         | cryptodesk.service| cryptodesk / trade             |
| dlbot      | /opt/dlbot         | 8792         | dlbot.service     | bathmanai.ir/dlbot/            |

Install:
```
cp deploy/nginx/*.conf /etc/nginx/sites-available/   # remove .conf suffix if needed
cp deploy/systemd/*.service /etc/systemd/system/
cp deploy/env/dlbot.env.example /etc/dlbot.env        # then fill real values
systemctl daemon-reload && systemctl enable --now clinic cryptodesk dlbot
nginx -t && systemctl reload nginx
```
